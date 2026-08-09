const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { admin, db, auth, storage } = require('../config/firebase');
const { processAffiliateCommission } = require('../utils/affiliateCommission');
const { finalizeProductAfterPurchase } = require('../utils/productPurchase');
const { creditWalletTopup } = require('../utils/walletTopup');
const addpayService = require('../services/addpay');
const sapoShippingService = require('../services/shippingService'); // provider facade (SAPO/ShipLogic)
const emailService = require('../services/resendEmailService');

const frontendBaseUrl = () => {
  let url = (process.env.FRONTEND_URL || 'https://www.verispinejointcenters.com').replace(/\/+$/, '');
  if (!/^https?:\/\//.test(url)) url = 'https://' + url;
  return url;
};

// Add funds to wallet. Supports two card providers:
//   - 'addpay'   : single redirect to AddPay's hosted page, then verify on return.
//   - 'traderoot': returns the topupId; the client drives the Traderoot tokenized
//                  flow via /api/payments/traderoot/topup/* and the callback page.
// The wallet itself stays the source of truth; crediting is idempotent via creditWalletTopup.
router.post('/add-funds', authMiddleware, async (req, res) => {
  try {
    const { amount, provider } = req.body;
    const userId = req.user.uid;

    if (!amount || parseFloat(amount) < 10) {
      return res.status(400).json({ success: false, message: 'Minimum top-up amount is R10' });
    }

    const prov = provider === 'traderoot' ? 'traderoot' : 'addpay';

    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const userData = userDoc.data();

    // Create the top-up record (pending until the provider confirms).
    const topupRef = db.collection('walletTopups').doc();
    const topupId = topupRef.id;
    await topupRef.set({
      id: topupId,
      userId,
      amount: parseFloat(amount),
      provider: prov,
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    if (prov === 'traderoot') {
      // Client continues with the Traderoot tokenized flow using this topupId.
      return res.json({ success: true, provider: 'traderoot', topupId });
    }

    // AddPay: create a hosted transaction and return its payment URL.
    const frontendUrl = frontendBaseUrl();
    const firstName = (userData.firstName || (userData.name ? userData.name.split(' ')[0] : '') || 'Customer').trim();
    const lastName = (userData.lastName || (userData.name && userData.name.split(' ').length > 1 ? userData.name.split(' ').slice(1).join(' ') : '')).trim();

    const result = await addpayService.initializePayment({
      amount: parseFloat(amount),
      email: userData.email,
      firstName,
      lastName,
      phone: userData.phone || userData.phoneNumber,
      description: 'VeriSpine Wallet Top-up',
      returnUrl: `${frontendUrl}/wallet?topup=verify&topup_id=${topupId}`,
      cancelUrl: `${frontendUrl}/wallet?topup=cancelled`
    });

    if (!result.success) {
      await topupRef.update({ status: 'failed', error: result.error || 'init failed', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      return res.status(502).json({ success: false, message: result.error || 'Failed to initialize top-up payment' });
    }

    await topupRef.update({
      addpayTransactionId: result.data.transactionId,
      addpayReference: result.data.reference,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.json({ success: true, provider: 'addpay', paymentUrl: result.data.paymentUrl, topupId });
  } catch (error) {
    console.error('Add funds error:', error);
    res.status(500).json({ success: false, message: 'Failed to initialize top-up payment' });
  }
});

// Verify a top-up and credit the wallet (idempotent). Called when the user returns
// from the provider. For AddPay we confirm the transaction with AddPay; for Traderoot
// the charge endpoint already credited, so we just report status.
router.post('/verify-topup', authMiddleware, async (req, res) => {
  try {
    const { topupId } = req.body;
    if (!topupId) return res.status(400).json({ success: false, message: 'topupId is required' });

    const topupDoc = await db.collection('walletTopups').doc(topupId).get();
    if (!topupDoc.exists) return res.status(404).json({ success: false, message: 'Top-up not found' });
    const topup = topupDoc.data();
    if (topup.userId !== req.user.uid) return res.status(403).json({ success: false, message: 'Unauthorized' });

    if (topup.status === 'completed') {
      return res.json({ success: true, status: 'completed' });
    }

    if (topup.provider === 'addpay') {
      if (!topup.addpayTransactionId) {
        return res.json({ success: false, status: 'pending' });
      }
      const verification = await addpayService.verifyTransaction(topup.addpayTransactionId);
      if (verification.success && verification.data.status === 'COMPLETE') {
        await creditWalletTopup(topupId);
        return res.json({ success: true, status: 'completed' });
      }
      return res.json({ success: false, status: (verification.data && verification.data.status) || 'pending' });
    }

    // Traderoot: crediting happens in the charge endpoint.
    return res.json({ success: topup.status === 'completed', status: topup.status });
  } catch (error) {
    console.error('Verify top-up error:', error);
    res.status(500).json({ success: false, message: 'Failed to verify top-up' });
  }
});

// Process wallet payment
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { orderId, amount } = req.body;
    const userId = req.user.uid;

    // Validate input
    if (!orderId || !amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment details'
      });
    }

    // Start a Firestore transaction
    const result = await db.runTransaction(async (transaction) => {
      // ============ STEP 1: ALL READS FIRST ============

      // Get user document
      const userRef = db.collection('users').doc(userId);
      const userDoc = await transaction.get(userRef);

      if (!userDoc.exists) {
        throw new Error('User not found');
      }

      const userData = userDoc.data();
      const currentBalance = Number(userData.balance || 0);

      // Check if user has sufficient balance
      if (currentBalance < Number(amount)) {
        throw new Error('Insufficient wallet balance');
      }

      // Get order document
      const orderRef = db.collection('orders').doc(orderId);
      const orderDoc = await transaction.get(orderRef);

      if (!orderDoc.exists) {
        throw new Error('Order not found');
      }

      const orderData = orderDoc.data();

      // Verify order belongs to user (check both buyerId and userId for compatibility)
      if (orderData.buyerId !== userId && orderData.userId !== userId) {
        throw new Error('Unauthorized access to order');
      }

      // Verify order amount matches - prefer totalAmount (includes shipping) over amount
      const orderAmount = Number(orderData.totalAmount || orderData.amount || 0);
      if (Math.abs(orderAmount - Number(amount)) > 0.01) {
        throw new Error(`Amount mismatch: expected ${orderAmount}, got ${amount}`);
      }

      // Check if order is already paid
      if (orderData.paymentStatus === 'paid') {
        throw new Error('Order already paid');
      }

      // Get product document if needed (READ before writes)
      let productRef = null;
      let productDoc = null;
      let productData = null;
      let sellerRef = null;
      let sellerDoc = null;
      let sellerData = null;
      let sellerBalance = 0;

      if (orderData.productId) {
        productRef = db.collection('products').doc(orderData.productId);
        productDoc = await transaction.get(productRef);

        if (productDoc.exists) {
          productData = productDoc.data();

          // Get seller document if needed (READ before writes)
          if (productData.sellerId && productData.sellerId !== userId) {
            sellerRef = db.collection('users').doc(productData.sellerId);
            sellerDoc = await transaction.get(sellerRef);

            if (sellerDoc.exists) {
              sellerData = sellerDoc.data();
              sellerBalance = Number(sellerData.balance || 0);
            }
          }
        }
      }

      // ============ STEP 2: ALL WRITES AFTER READS ============

      // Create payment record
      const paymentRef = db.collection('payments').doc();
      const paymentId = paymentRef.id;

      const paymentDataObj = {
        id: paymentId,
        orderId,
        userId,
        amount,
        method: 'wallet',
        status: 'completed',
        transactionType: 'order_payment',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        completedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      // Create wallet transaction record
      const transactionRef = db.collection('walletTransactions').doc();
      const walletTransaction = {
        id: transactionRef.id,
        userId,
        type: 'debit',
        amount,
        balanceBefore: currentBalance,
        balanceAfter: currentBalance - Number(amount),
        description: `Payment for order #${orderId}`,
        relatedOrderId: orderId,
        relatedPaymentId: paymentId,
        status: 'completed',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      };

      // Update user balance
      transaction.update(userRef, {
        balance: currentBalance - Number(amount),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Update order status — 'processing' until SAPO shipment confirms 'shipped'
      transaction.update(orderRef, {
        status: 'processing',
        paymentStatus: 'paid',
        paymentMethod: 'wallet',
        fundsHeld: true, // seller funds held in pendingBalance until delivery
        paymentId,
        paidAmount: amount,
        paidAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Create payment record
      transaction.set(paymentRef, paymentDataObj);

      // Create wallet transaction record
      transaction.set(transactionRef, walletTransaction);

      // Update product status if needed
      if (productRef && productDoc && productDoc.exists && productData) {
        // Mark sold (auction/buy_now) or decrement stock (fixed-price sale).
        finalizeProductAfterPurchase(transaction, productRef, productData, { ...orderData, buyerId: userId, amount });

        // Transfer funds to seller (minus platform fee)
        if (sellerRef && sellerDoc && sellerDoc.exists && sellerData) {
          // Fee is charged on the item price only (platform keeps shipping). 10% unified rate.
          const platformFee = Number(orderData.amount) * 0.10;
          const sellerAmount = Number(orderData.amount) - platformFee;

          // Hold the seller's net in pendingBalance — released to balance only on delivery.
          transaction.update(sellerRef, {
            pendingBalance: admin.firestore.FieldValue.increment(sellerAmount),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });

          // Create seller wallet transaction (held until delivery)
          const sellerTransactionRef = db.collection('walletTransactions').doc();
          transaction.set(sellerTransactionRef, {
            id: sellerTransactionRef.id,
            userId: productData.sellerId,
            type: 'sale',
            amount: sellerAmount,
            description: `Sale of ${productData.title} (held until delivery)`,
            relatedOrderId: orderId,
            platformFee,
            status: 'pending',
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }
      }

      return {
        paymentId,
        newBalance: currentBalance - Number(amount),
        orderAmount: Number(amount)
      };
    });

    // Process affiliate commission if buyer was referred
    try {
      await processAffiliateCommission(userId, orderId, result.orderAmount);
    } catch (commissionError) {
      console.error('Error processing affiliate commission:', commissionError);
      // Don't fail the payment if commission processing fails
    }

    // Create SAPO shipment after successful payment
    console.log('=== STARTING SAPO SHIPMENT CREATION (WALLET) ===');
    let shippingInfo = null;
    try {
      // Fetch fresh order data with shipping info
      const updatedOrderDoc = await db.collection('orders').doc(orderId).get();
      const updatedOrder = { id: orderId, ...updatedOrderDoc.data() };
      console.log('Order data for SAPO:', updatedOrder.shippingInfo ? 'Has shipping info' : 'No shipping info');

      // Create shipment with SAPO
      const shipmentResult = await sapoShippingService.createShipmentForOrder(updatedOrder);
      console.log('SAPO shipment created:', shipmentResult.trackingNumber);

      // Update order with tracking info and main status
      await db.collection('orders').doc(orderId).update({
        status: 'shipped',
        trackingNumber: shipmentResult.trackingNumber,
        carrier: shipmentResult.carrier || 'SAPO',
        shippingStatus: 'shipped',
        shippedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      shippingInfo = {
        trackingNumber: shipmentResult.trackingNumber,
        carrier: shipmentResult.carrier || 'SAPO',
        status: 'shipped'
      };
    } catch (shippingError) {
      console.error('Error creating SAPO shipment:', shippingError.message);
      // Don't fail the payment if shipping creation fails
    }

    // Send comprehensive order confirmation email with invoice and shipping
    console.log('=== SENDING ORDER CONFIRMATION EMAIL (WALLET) ===');
    try {
      const userDoc = await db.collection('users').doc(userId).get();
      const user = userDoc.data();
      console.log('User email:', user.email);

      const finalOrderDoc = await db.collection('orders').doc(orderId).get();
      const finalOrder = { id: orderId, ...finalOrderDoc.data() };

      await emailService.sendOrderConfirmationWithInvoice(user, finalOrder, shippingInfo);
      console.log('Order confirmation email sent!');

      // Also notify seller
      if (finalOrder.sellerId) {
        const sellerDoc = await db.collection('users').doc(finalOrder.sellerId).get();
        if (sellerDoc.exists) {
          await emailService.sendSaleNotification(sellerDoc.data(), finalOrder);
          console.log('Seller notification email sent!');
        }
      }
    } catch (emailError) {
      console.error('Error sending order confirmation email:', emailError.message);
    }

    res.json({
      success: true,
      message: 'Payment successful',
      data: {
        paymentId: result.paymentId,
        newBalance: result.newBalance,
        orderId,
        shipping: shippingInfo
      }
    });

  } catch (error) {
    console.error('Wallet payment error:', error);
    if (error.code === 'OUT_OF_STOCK') {
      return res.status(409).json({
        success: false,
        code: 'OUT_OF_STOCK',
        message: 'This item just sold out. No funds were deducted — please pick another item.'
      });
    }
    res.status(400).json({
      success: false,
      message: error.message || 'Payment failed'
    });
  }
});

// Check wallet balance
router.get('/balance', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.uid;
    
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const userData = userDoc.data();
    
    res.json({
      success: true,
      data: {
        balance: userData.balance || 0,
        currency: 'ZAR'
      }
    });

  } catch (error) {
    console.error('Error fetching wallet balance:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch balance'
    });
  }
});

// Get wallet transaction history
router.get('/transactions', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.uid;
    const { limit = 20, startAfter } = req.query;

    let query = db.collection('walletTransactions')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(parseInt(limit));

    if (startAfter) {
      const startDoc = await db.collection('walletTransactions').doc(startAfter).get();
      if (startDoc.exists) {
        query = query.startAfter(startDoc);
      }
    }

    const snapshot = await query.get();
    const transactions = [];

    snapshot.forEach(doc => {
      transactions.push({
        id: doc.id,
        ...doc.data()
      });
    });

    res.json({
      success: true,
      data: transactions
    });

  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transactions'
    });
  }
});

module.exports = router;