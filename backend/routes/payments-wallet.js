const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { admin, db, auth, storage } = require('../config/firebase');
const { processAffiliateCommission } = require('../utils/affiliateCommission');
const { finalizeProductAfterPurchase } = require('../utils/productPurchase');
const { creditWalletTopup } = require('../utils/walletTopup');
const shippingService = require('../services/shippingService');
const emailService = require('../services/resendEmailService');
const { sellerNetFor } = require('../utils/sellerPayout');
const { subtractMoney } = require('../utils/money');

const frontendBaseUrl = () => {
  let url = (process.env.FRONTEND_URL || 'https://www.verispinejointcenters.com').replace(/\/+$/, '');
  if (!/^https?:\/\//.test(url)) url = 'https://' + url;
  return url;
};

// Create a pending wallet top-up. Payment itself is handled by Stripe —
// the client takes the returned topupId to /api/payments/stripe/topup/create-session.
// The wallet stays the source of truth; crediting is idempotent via creditWalletTopup.
router.post('/add-funds', authMiddleware, async (req, res) => {
  try {
    const { amount } = req.body;
    const userId = req.user.uid;

    if (!amount || parseFloat(amount) < 10) {
      return res.status(400).json({ success: false, message: 'Minimum top-up amount is $10' });
    }

    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const topupRef = db.collection('walletTopups').doc();
    await topupRef.set({
      id: topupRef.id,
      userId,
      amount: parseFloat(amount),
      provider: 'stripe',
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.json({ success: true, provider: 'stripe', topupId: topupRef.id });
  } catch (error) {
    console.error('Add funds error:', error);
    res.status(500).json({ success: false, message: 'Failed to start top-up' });
  }
});

// Report top-up status. Crediting happens in the Stripe webhook
// (/api/payments/stripe/webhook), which is the authoritative path; this is the
// browser-return check the wallet page polls after redirect.
router.post('/verify-topup', authMiddleware, async (req, res) => {
  try {
    const { topupId } = req.body;
    if (!topupId) return res.status(400).json({ success: false, message: 'topupId is required' });

    const topupDoc = await db.collection('walletTopups').doc(topupId).get();
    if (!topupDoc.exists) return res.status(404).json({ success: false, message: 'Top-up not found' });
    const topup = topupDoc.data();
    if (topup.userId !== req.user.uid) return res.status(403).json({ success: false, message: 'Unauthorized' });

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
        balance: subtractMoney(currentBalance, amount),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Update order status — 'processing' until the shipment confirms 'shipped'
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
          // Same helper the delivery-time release uses, so the amount held and
          // the amount released are identical to the cent.
          const sellerAmount = sellerNetFor(orderData.amount);
          const platformFee = subtractMoney(orderData.amount, sellerAmount);

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
        newBalance: subtractMoney(currentBalance, amount),
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

    // Create the shipment after successful payment
    console.log('=== STARTING SHIPMENT CREATION (WALLET) ===');
    let shippingInfo = null;
    try {
      // Fetch fresh order data with shipping info
      const updatedOrderDoc = await db.collection('orders').doc(orderId).get();
      const updatedOrder = { id: orderId, ...updatedOrderDoc.data() };
      console.log('Order shipping data:', updatedOrder.shippingInfo ? 'Has shipping info' : 'No shipping info');

      // Create the shipment with the active carrier
      const shipmentResult = await shippingService.createShipmentForOrder(updatedOrder);
      console.log('Shipment created:', shipmentResult.trackingNumber);

      // Update order with tracking info and main status
      await db.collection('orders').doc(orderId).update({
        status: 'shipped',
        trackingNumber: shipmentResult.trackingNumber,
        // Written as shippingCarrier — the field every order-side reader uses.
        // The payment paths used to write plain `carrier` while the shipping
        // route wrote `shippingCarrier`, so an order paid at checkout showed no
        // carrier on the order page, the invoice, or the PDF export.
        shippingCarrier: shipmentResult.carrier || 'USPS',
        shippingStatus: 'shipped',
        shippedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      shippingInfo = {
        trackingNumber: shipmentResult.trackingNumber,
        carrier: shipmentResult.carrier || 'USPS',
        status: 'shipped'
      };
    } catch (shippingError) {
      console.error('Error creating shipment:', shippingError.message);
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
        currency: 'USD'
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