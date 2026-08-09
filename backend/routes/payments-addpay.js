const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const addpayService = require('../services/addpay');
const sapoShippingService = require('../services/shippingService'); // provider facade (SAPO/ShipLogic)
const emailService = require('../services/resendEmailService');
const { admin, db, auth, storage } = require('../config/firebase');
const { processAffiliateCommission } = require('../utils/affiliateCommission');
const { finalizeProductAfterPurchase } = require('../utils/productPurchase');

// Initialize AddPay payment
router.post('/initialize', authMiddleware, async (req, res) => {
  try {
    const {
      amount,
      currency = 'USD',
      customerDetails,
      metadata
    } = req.body;
    const userId = req.user.uid;

    // Validate input
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount'
      });
    }

    // Get user details
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const userData = userDoc.data();

    // Prepare payment data
    const paymentData = {
      amount,
      currency,
      email: customerDetails?.email || userData.email,
      phone: customerDetails?.phoneNumber || userData.phone || '',
      name: customerDetails?.name || userData.name || `${userData.firstName || ''} ${userData.lastName || ''}`.trim(),
      firstName: customerDetails?.name?.split(' ')[0] || userData.firstName || '',
      lastName: customerDetails?.name?.split(' ').slice(1).join(' ') || userData.lastName || '',
      description: metadata?.productTitle ? `Payment for ${metadata.productTitle}` : 'VeriSpine Purchase',
      orderId: metadata?.orderId,
      productId: metadata?.productId,
      userId
    };

    // Initialize payment with AddPay
    const result = await addpayService.initializePayment(paymentData);

    if (result.success) {
      // Save payment record
      const paymentRef = db.collection('payments').doc();
      await paymentRef.set({
        id: paymentRef.id,
        orderId: metadata?.orderId,
        userId,
        amount,
        currency,
        method: 'addpay',
        status: 'pending',
        transactionId: result.data.transactionId,
        reference: result.data.reference,
        paymentUrl: result.data.paymentUrl,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      res.json({
        success: true,
        status: 'success',
        data: {
          paymentUrl: result.data.paymentUrl,
          transactionId: result.data.transactionId,
          reference: result.data.reference
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.error || 'Payment initialization failed'
      });
    }

  } catch (error) {
    console.error('AddPay initialization error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initialize payment',
      error: error.message
    });
  }
});

// Verify AddPay payment status
router.get('/status/:transactionId', authMiddleware, async (req, res) => {
  try {
    const { transactionId } = req.params;

    if (!transactionId) {
      return res.status(400).json({
        success: false,
        message: 'Transaction ID is required'
      });
    }

    const result = await addpayService.verifyTransaction(transactionId);

    if (result.success) {
      res.json({
        success: true,
        status: result.data.status,
        data: result.data
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.error || 'Transaction verification failed'
      });
    }

  } catch (error) {
    console.error('AddPay status check error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check payment status',
      error: error.message
    });
  }
});

// AddPay webhook / async notification handler
router.post('/webhook', async (req, res) => {
  try {
    const data = req.body;
    console.log('AddPay webhook received:', JSON.stringify(data));

    const transactionId = data.id || data.transaction_id;
    const reference = data.reference;
    const status = data.status || data.state;

    if (!transactionId && !reference) {
      console.error('AddPay webhook: missing transaction ID and reference');
      return res.status(400).json({ error: 'Missing transaction identifier' });
    }

    // Verify the transaction server-side - never trust webhook status
    let verifiedStatus = null;
    let verifiedAmount = null;
    if (transactionId) {
      const verification = await addpayService.verifyTransaction(transactionId);
      if (verification.success) {
        verifiedStatus = verification.data.status;
        verifiedAmount = verification.data.amount;
      }
    }
    if (!verifiedStatus) {
      console.error('AddPay webhook: could not verify transaction');
      return res.status(200).json({ status: 'ok', message: 'Verification pending' });
    }

    // Find payment record
    let paymentSnapshot;
    if (transactionId) {
      paymentSnapshot = await db.collection('payments')
        .where('transactionId', '==', transactionId)
        .limit(1)
        .get();
    }
    if ((!paymentSnapshot || paymentSnapshot.empty) && reference) {
      paymentSnapshot = await db.collection('payments')
        .where('reference', '==', reference)
        .limit(1)
        .get();
    }

    if (!paymentSnapshot || paymentSnapshot.empty) {
      console.error('AddPay webhook: payment record not found for', transactionId || reference);
      return res.status(200).json({ status: 'ok', message: 'Payment record not found' });
    }

    const paymentDoc = paymentSnapshot.docs[0];
    const payment = paymentDoc.data();

    if (verifiedStatus === 'COMPLETE' || verifiedStatus === 'COMPLETED') {
      // Defense-in-depth: surface any mismatch between the AddPay-verified amount and what we
      // recorded at initialization. Status is already server-verified above, so we log (not block)
      // to avoid false-rejecting real payments on an amount-unit difference.
      if (verifiedAmount != null && payment.amount != null &&
          Math.abs(Number(verifiedAmount) - Number(payment.amount)) > 0.01) {
        console.warn(`AddPay webhook: amount mismatch for ${transactionId} — verified=${verifiedAmount} recorded=${payment.amount}`);
      }
      // Payment successful
      await paymentDoc.ref.update({
        status: 'completed',
        transactionId: transactionId || payment.transactionId,
        webhookProcessedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      if (payment.orderId) {
        const orderRef = db.collection('orders').doc(payment.orderId);
        const orderDoc = await orderRef.get();
        const orderData = orderDoc.exists ? orderDoc.data() : null;

        if (!orderData) {
          console.error(`AddPay webhook: order ${payment.orderId} not found`);
          return res.status(200).json({ status: 'ok', message: 'Order not found' });
        }

        // Idempotency: if frontend verification already advanced the order, do not regress it.
        // The verification endpoint moves status from pending_payment → processing → shipped.
        // The webhook is a fallback (e.g., browser closed before redirect).
        const alreadyAdvanced = ['processing', 'shipped', 'delivered'].includes(orderData.status);
        const alreadyPaid = ['paid', 'completed'].includes(orderData.paymentStatus);

        if (alreadyAdvanced && alreadyPaid) {
          console.log(`AddPay webhook: order ${payment.orderId} already advanced (status=${orderData.status}). Skipping.`);
          return res.status(200).json({ status: 'success', message: 'Order already processed' });
        }

        // Otherwise, this webhook is acting as the fallback path. Move order forward.
        await orderRef.update({
          paymentStatus: 'completed',
          paymentMethod: 'addpay',
          addpayTransactionId: transactionId,
          addpayReference: reference,
          status: 'processing',
          paidAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`Order ${payment.orderId} payment confirmed via AddPay webhook (fallback path)`);

        // Fixed-price fallback: decrement stock atomically (mark sold when depleted).
        // Auction/buy_now product status is handled by the verification endpoint.
        if (orderData.type === 'sale') {
          try {
            await db.runTransaction(async (tx) => {
              const pRef = db.collection('products').doc(orderData.productId);
              const pSnap = await tx.get(pRef);
              if (pSnap.exists) {
                finalizeProductAfterPurchase(tx, pRef, pSnap.data(), { ...orderData, amount: payment.amount });
              }
            });
          } catch (stockErr) {
            console.error('AddPay webhook sale stock finalize error:', stockErr.message);
          }
        }

        // Process affiliate commission if buyer was referred (idempotent)
        if (orderData.buyerId) {
          try {
            await processAffiliateCommission(orderData.buyerId, payment.orderId, payment.amount);
          } catch (commissionError) {
            console.error('Error processing affiliate commission:', commissionError);
          }
        }

        // Create SAPO shipment + send confirmation emails (same flow as verification endpoint)
        let shippingInfo = null;
        try {
          const updatedOrderDoc = await orderRef.get();
          const updatedOrder = { id: payment.orderId, ...updatedOrderDoc.data() };
          const shipmentResult = await sapoShippingService.createShipmentForOrder(updatedOrder);
          console.log('SAPO shipment created (AddPay webhook):', shipmentResult.trackingNumber);

          await orderRef.update({
            status: 'shipped',
            trackingNumber: shipmentResult.trackingNumber,
            carrier: shipmentResult.carrier || 'SAPO',
            shippingStatus: 'shipped',
            shippedAt: admin.firestore.FieldValue.serverTimestamp(),
            shippingError: admin.firestore.FieldValue.delete(),
            shippingErrorAt: admin.firestore.FieldValue.delete()
          });

          shippingInfo = {
            trackingNumber: shipmentResult.trackingNumber,
            carrier: shipmentResult.carrier || 'SAPO',
            status: 'shipped'
          };
        } catch (shippingError) {
          console.error('SAPO shipment error (AddPay webhook):', shippingError.message);
          try {
            await orderRef.update({
              shippingError: shippingError.message,
              shippingErrorAt: admin.firestore.FieldValue.serverTimestamp()
            });
          } catch (e) { /* swallow */ }
        }

        try {
          const buyerDoc = await db.collection('users').doc(orderData.buyerId).get();
          const finalOrderDoc = await orderRef.get();
          const finalOrder = { id: payment.orderId, ...finalOrderDoc.data() };

          if (buyerDoc.exists) {
            await emailService.sendOrderConfirmationWithInvoice(buyerDoc.data(), finalOrder, shippingInfo);
          }
          if (orderData.sellerId) {
            const sellerDoc = await db.collection('users').doc(orderData.sellerId).get();
            if (sellerDoc.exists) {
              await emailService.sendSaleNotification(sellerDoc.data(), finalOrder);
            }
          }
        } catch (emailError) {
          console.error('Email error (AddPay webhook):', emailError.message);
        }
      }
    } else if (verifiedStatus === 'FAILED') {
      await paymentDoc.ref.update({
        status: 'failed',
        transactionId: transactionId || payment.transactionId,
        webhookProcessedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      if (payment.orderId) {
        const orderRef = db.collection('orders').doc(payment.orderId);
        await orderRef.update({
          paymentStatus: 'failed',
          status: 'cancelled',
          cancellationReason: 'Payment failed',
          cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log(`Order ${payment.orderId} cancelled due to failed payment`);
      }
    } else if (verifiedStatus === 'CANCELLED') {
      await paymentDoc.ref.update({
        status: 'cancelled',
        transactionId: transactionId || payment.transactionId,
        webhookProcessedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      if (payment.orderId) {
        const orderRef = db.collection('orders').doc(payment.orderId);
        await orderRef.update({
          paymentStatus: 'cancelled',
          status: 'cancelled',
          cancellationReason: 'Payment cancelled by user',
          cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log(`Order ${payment.orderId} cancelled due to cancelled payment`);
      }
    }

    res.status(200).json({ status: 'success' });

  } catch (error) {
    console.error('AddPay webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

module.exports = router;
