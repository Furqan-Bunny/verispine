const express = require('express');
const router = express.Router();
const { admin, db, auth, storage } = require('../config/firebase');
const { authMiddleware } = require('../middleware/auth');
const shippingService = require('../services/shippingService');
const emailService = require('../services/resendEmailService');
const { processAffiliateCommission } = require('../utils/affiliateCommission');
const { finalizeProductAfterPurchase } = require('../utils/productPurchase');
const crypto = require('crypto');

// Verify payment and update order status
router.post('/verify/:orderId', authMiddleware, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { paymentMethod, transactionId, paymentReference } = req.body;
    const userId = req.user.uid;
    
    // Get order details
    const orderDoc = await db.collection('orders').doc(orderId).get();
    
    if (!orderDoc.exists) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    const order = orderDoc.data();
    
    // Verify order belongs to user
    if (order.buyerId !== userId) {
      return res.status(403).json({ error: 'Unauthorized access' });
    }
    
    // Check if already paid
    if (order.paymentStatus === 'paid' || order.paymentStatus === 'completed') {
      // Already paid - return success
      return res.json({
        success: true,
        message: 'Payment already verified',
        data: {
          orderId,
          status: order.status,
          paymentStatus: order.paymentStatus
        }
      });
    }
    
    let paymentVerified = false;
    let paymentDetails = {};
    
    // Verify payment based on method
    switch (paymentMethod) {
      case 'wallet':
        // Wallet payments are already verified in payments-wallet.js
        // Just check if payment record exists
        const walletPaymentSnapshot = await db.collection('payments')
          .where('orderId', '==', orderId)
          .where('method', '==', 'wallet')
          .where('status', '==', 'completed')
          .limit(1)
          .get();
        
        if (!walletPaymentSnapshot.empty) {
          paymentVerified = true;
          paymentDetails = walletPaymentSnapshot.docs[0].data();
        }
        break;
        
      case 'stripe': {
        // Stripe settles via its webhook; a completed payment row is the proof.
        const stripeSnapshot = await db.collection('payments')
          .where('orderId', '==', orderId)
          .where('method', '==', 'stripe')
          .where('status', '==', 'completed')
          .limit(1)
          .get();

        if (!stripeSnapshot.empty) {
          paymentVerified = true;
          paymentDetails = stripeSnapshot.docs[0].data();
        }
        break;
      }

      default:
        return res.status(400).json({ error: 'Invalid payment method' });
    }
    
    if (!paymentVerified) {
      return res.status(400).json({ error: 'Payment verification failed' });
    }
    
    // Update order and product status in a transaction
    const result = await db.runTransaction(async (transaction) => {
      // ============ STEP 1: ALL READS FIRST ============

      // Get product
      const productRef = db.collection('products').doc(order.productId);
      const productDoc = await transaction.get(productRef);
      const product = productDoc.exists ? productDoc.data() : null;

      // Get seller if needed
      let sellerRef = null;
      let sellerDoc = null;
      let seller = null;

      if (product && paymentMethod !== 'wallet' && product.sellerId) {
        sellerRef = db.collection('users').doc(product.sellerId);
        sellerDoc = await transaction.get(sellerRef);
        seller = sellerDoc.exists ? sellerDoc.data() : null;
      }

      // ============ STEP 2: ALL WRITES AFTER READS ============

      // Update order status
      transaction.update(orderDoc.ref, {
        paymentStatus: 'completed',
        paymentMethod,
        paymentDetails,
        status: 'processing',
        fundsHeld: true, // seller funds held in pendingBalance until delivery
        paidAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      if (product) {
        // Mark product sold (auction) or decrement stock (fixed-price sale).
        finalizeProductAfterPurchase(transaction, productRef, product, { ...order, buyerId: userId });

        // If it's not a wallet payment, transfer funds to seller
        // (Wallet payments already handle this in the payment transaction)
        if (paymentMethod !== 'wallet' && seller && sellerRef) {
          const platformFee = order.amount * 0.10; // 10% platform fee (unified)
          const sellerAmount = order.amount - platformFee;

          // Update seller's pending balance (not actual balance until withdrawal)
          transaction.update(sellerRef, {
            pendingBalance: admin.firestore.FieldValue.increment(sellerAmount),
            totalSales: admin.firestore.FieldValue.increment(1),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });

          // Create transaction record for seller
          const sellerTransactionRef = db.collection('transactions').doc();
          transaction.set(sellerTransactionRef, {
            id: sellerTransactionRef.id,
            userId: product.sellerId,
            type: 'sale',
            amount: sellerAmount,
            grossAmount: order.amount,
            platformFee,
            description: `Sale of ${product.title}`,
            orderId,
            status: 'pending',
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }
      }

      // Create payment record if not wallet (wallet creates its own)
      if (paymentMethod !== 'wallet') {
        const paymentRef = db.collection('payments').doc();
        transaction.set(paymentRef, {
          id: paymentRef.id,
          orderId,
          userId,
          amount: order.amount,
          method: paymentMethod,
          status: 'completed',
          paymentDetails,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }

      // Send notification to seller
      if (order.sellerId) {
        const notificationRef = db.collection('notifications').doc();
        transaction.set(notificationRef, {
          id: notificationRef.id,
          userId: order.sellerId,
          type: 'sale',
          title: 'New Sale!',
          message: `Your item "${order.productTitle}" has been sold for $${order.amount}`,
          orderId,
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }

      return { success: true };
    });

    // ============ POST-PAYMENT SIDE EFFECTS ============
    // (Outside transaction - these can fail without rolling back the payment)

    // 1. Process affiliate commission if buyer was referred (idempotent via affiliateCommissions check)
    try {
      await processAffiliateCommission(order.buyerId, orderId, order.amount);
    } catch (commissionError) {
      console.error('Affiliate commission error (verification):', commissionError);
    }

    // 2. Create the shipment after successful payment
    console.log('=== STARTING SHIPMENT CREATION (verification) ===');
    let shippingInfo = null;
    try {
      // Fetch fresh order data with shipping info
      const updatedOrderDoc = await db.collection('orders').doc(orderId).get();
      const updatedOrder = { id: orderId, ...updatedOrderDoc.data() };
      console.log('Order shipping data:', updatedOrder.shippingInfo ? 'Has shipping info' : 'No shipping info');

      // Create the shipment with the active carrier
      const shipmentResult = await shippingService.createShipmentForOrder(updatedOrder);
      console.log('Shipment created (verification):', shipmentResult.trackingNumber);

      // Update order with tracking info and main status
      await db.collection('orders').doc(orderId).update({
        status: 'shipped',
        trackingNumber: shipmentResult.trackingNumber,
        carrier: shipmentResult.carrier || 'USPS',
        shippingStatus: 'shipped',
        shippedAt: admin.firestore.FieldValue.serverTimestamp(),
        shippingError: admin.firestore.FieldValue.delete(),
        shippingErrorAt: admin.firestore.FieldValue.delete()
      });

      shippingInfo = {
        trackingNumber: shipmentResult.trackingNumber,
        carrier: shipmentResult.carrier || 'USPS',
        status: 'shipped'
      };
    } catch (shippingError) {
      console.error('Shipment error (verification):', shippingError.message);
      // Persist error so admin/sweeper can retry. Order stays at 'processing'.
      try {
        await db.collection('orders').doc(orderId).update({
          shippingError: shippingError.message,
          shippingErrorAt: admin.firestore.FieldValue.serverTimestamp()
        });
      } catch (e) {
        console.error('Failed to persist shipping error:', e.message);
      }
    }

    // 3. Send order confirmation emails (buyer invoice + seller sale notification)
    console.log('=== SENDING ORDER CONFIRMATION EMAILS (verification) ===');
    try {
      const buyerDoc = await db.collection('users').doc(order.buyerId).get();
      const finalOrderDoc = await db.collection('orders').doc(orderId).get();
      const finalOrder = { id: orderId, ...finalOrderDoc.data() };

      if (buyerDoc.exists) {
        await emailService.sendOrderConfirmationWithInvoice(buyerDoc.data(), finalOrder, shippingInfo);
        console.log('Buyer order confirmation email sent');
      }

      if (order.sellerId) {
        const sellerDoc = await db.collection('users').doc(order.sellerId).get();
        if (sellerDoc.exists) {
          await emailService.sendSaleNotification(sellerDoc.data(), finalOrder);
          console.log('Seller sale notification email sent');
        }
      }
    } catch (emailError) {
      console.error('Email error (verification):', emailError.message);
    }

    res.json({
      success: true,
      message: 'Payment verified and order updated successfully',
      data: {
        orderId,
        status: shippingInfo ? 'shipped' : 'processing',
        paymentStatus: 'completed',
        shipping: shippingInfo
      }
    });

  } catch (error) {
    console.error('Payment verification error:', error.message || error);
    if (error.code === 'OUT_OF_STOCK') {
      return res.status(409).json({
        error: 'This item just sold out and your payment could not be completed. Please contact support for a refund.',
        code: 'OUT_OF_STOCK'
      });
    }
    res.status(500).json({
      error: 'Failed to verify payment',
      details: error.message || 'Unknown error'
    });
  }
});

// Get payment status for an order
router.get('/status/:orderId', authMiddleware, async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user.uid;
    
    const orderDoc = await db.collection('orders').doc(orderId).get();
    
    if (!orderDoc.exists) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    const order = orderDoc.data();
    
    // Verify access
    if (order.buyerId !== userId && order.sellerId !== userId) {
      return res.status(403).json({ error: 'Unauthorized access' });
    }
    
    res.json({
      success: true,
      data: {
        orderId,
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod,
        status: order.status,
        amount: order.amount
      }
    });
    
  } catch (error) {
    console.error('Error fetching payment status:', error);
    res.status(500).json({ error: 'Failed to fetch payment status' });
  }
});

module.exports = router;