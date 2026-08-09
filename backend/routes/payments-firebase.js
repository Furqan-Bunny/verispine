const express = require('express');
const router = express.Router();
const { admin, db, auth, storage } = require('../config/firebase');
const { authMiddleware } = require('../middleware/auth');
const emailService = require('../services/resendEmailService');
const addpayService = require('../services/addpay');
const crypto = require('crypto');
const { processAffiliateCommission } = require('../utils/affiliateCommission');
const sapoShippingService = require('../services/shippingService'); // provider facade (SAPO/ShipLogic)

// Process payment for an order
router.post('/process', authMiddleware, async (req, res) => {
  try {
    const { orderId, paymentMethod } = req.body;
    const userId = req.user.uid;
    
    // Validate payment method
    const validMethods = ['balance', 'addpay', 'traderoot'];
    if (!validMethods.includes(paymentMethod)) {
      return res.status(400).json({ error: 'Invalid payment method' });
    }
    
    // Get order details
    const orderDoc = await db.collection('orders').doc(orderId).get();
    if (!orderDoc.exists) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    const order = orderDoc.data();
    
    // Verify user is the buyer
    if (order.buyerId !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    // Check order status
    if (order.status !== 'pending_payment') {
      return res.status(400).json({ error: 'Order already processed or cancelled' });
    }
    
    // Get user details
    const userDoc = await db.collection('users').doc(userId).get();
    const user = userDoc.data();
    
    if (paymentMethod === 'balance') {
      // Process balance payment
      if (user.balance < order.amount) {
        return res.status(400).json({ 
          error: `Insufficient balance. Required: R${order.amount}, Available: R${user.balance}` 
        });
      }
      
      // Use transaction for balance payment
      await db.runTransaction(async (transaction) => {
        // Deduct from buyer's balance
        transaction.update(userDoc.ref, {
          balance: admin.firestore.FieldValue.increment(-order.amount),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // Update order status — 'processing' until SAPO shipment confirms 'shipped'
        transaction.update(orderDoc.ref, {
          status: 'processing',
          paymentStatus: 'completed',
          paymentMethod: 'balance',
          fundsHeld: true, // seller funds held in pendingBalance until delivery
          paidAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // Update product status to sold (single-item only; fixed-price 'sale'
        // stock is handled by the wallet/verification endpoints, not this legacy path)
        if (order.type !== 'sale') {
          const productRef = db.collection('products').doc(order.productId);
          transaction.update(productRef, {
            status: 'sold',
            soldTo: userId,
            soldAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }

        // Create transaction record
        const transactionRef = db.collection('transactions').doc();
        transaction.set(transactionRef, {
          userId,
          orderId,
          type: 'purchase',
          amount: -order.amount,
          status: 'completed',
          description: `Purchase: ${order.productTitle}`,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // Hold the seller's net in pendingBalance — released to balance only on delivery.
        const sellerRef = db.collection('users').doc(order.sellerId);
        const platformFee = Number(order.amount) * 0.1; // 10% platform fee
        const sellerAmount = Number(order.amount) - platformFee;

        transaction.update(sellerRef, {
          pendingBalance: admin.firestore.FieldValue.increment(sellerAmount),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // Create seller transaction record
        const sellerTransactionRef = db.collection('transactions').doc();
        transaction.set(sellerTransactionRef, {
          userId: order.sellerId,
          orderId,
          type: 'sale',
          amount: sellerAmount,
          status: 'completed',
          description: `Sale: ${order.productTitle}`,
          platformFee,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      });
      
      // Process affiliate commission if buyer was referred
      try {
        await processAffiliateCommission(userId, orderId, order.amount);
      } catch (commissionError) {
        console.error('Error processing affiliate commission:', commissionError);
        // Don't fail the payment if commission processing fails
      }

      // Create SAPO shipment after successful payment
      console.log('=== STARTING SAPO SHIPMENT CREATION ===');
      let shippingInfo = null;
      try {
        // Fetch fresh order data with shipping info
        const updatedOrderDoc = await db.collection('orders').doc(orderId).get();
        const updatedOrder = { id: orderId, ...updatedOrderDoc.data() };
        console.log('Order data for SAPO:', JSON.stringify(updatedOrder, null, 2));

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
        console.error('Error creating SAPO shipment:', shippingError);
        // Don't fail the payment if shipping creation fails
        // Admin can manually create shipment later
      }

      // Send comprehensive order confirmation email with invoice and shipping
      console.log('=== SENDING ORDER CONFIRMATION EMAIL ===');
      console.log('User email:', user.email);
      console.log('Shipping info:', shippingInfo);
      try {
        const finalOrderDoc = await db.collection('orders').doc(orderId).get();
        const finalOrder = { id: orderId, ...finalOrderDoc.data() };
        console.log('Calling sendOrderConfirmationWithInvoice...');
        await emailService.sendOrderConfirmationWithInvoice(user, finalOrder, shippingInfo);
        console.log('Email sent successfully!');

        // Also notify seller
        const sellerDoc = await db.collection('users').doc(order.sellerId).get();
        if (sellerDoc.exists) {
          await emailService.sendSaleNotification(sellerDoc.data(), finalOrder);
        }
      } catch (emailError) {
        console.error('Error sending order confirmation email:', emailError);
      }

      return res.json({
        success: true,
        message: 'Payment processed successfully',
        redirectUrl: `/orders/${orderId}`,
        shipping: shippingInfo
      });

    } else if (paymentMethod === 'addpay') {
      // Initialize AddPay payment
      const paymentData = {
        amount: order.amount,
        currency: 'ZAR',
        email: user.email,
        phone: user.phone || '',
        name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        description: `Payment for ${order.productTitle}`,
        orderId,
        productId: order.productId,
        userId
      };

      const result = await addpayService.initializePayment(paymentData);

      if (result.success) {
        // Update order with payment reference
        await orderDoc.ref.update({
          paymentMethod: 'addpay',
          paymentStatus: 'processing',
          paymentReference: result.data.reference,
          addpayTransactionId: result.data.transactionId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        return res.json({
          success: true,
          paymentMethod: 'addpay',
          paymentUrl: result.data.paymentUrl
        });
      } else {
        return res.status(500).json({ error: result.error || 'Failed to initialize payment' });
      }
    } else if (paymentMethod === 'traderoot') {
      // Traderoot uses its own dedicated route at /api/payments/traderoot/initialize
      // Redirect the caller there
      return res.json({
        success: true,
        paymentMethod: 'traderoot',
        redirect: '/api/payments/traderoot/initialize',
        message: 'Use POST /api/payments/traderoot/initialize with { orderId } instead'
      });
    }

  } catch (error) {
    console.error('Error processing payment:', error);
    res.status(500).json({ error: 'Failed to process payment' });
  }
});

// AddPay payment verification
router.post('/addpay/verify', authMiddleware, async (req, res) => {
  try {
    const { transactionId, orderId } = req.body;

    // Verify payment with AddPay
    const verification = await addpayService.verifyTransaction(transactionId);

    if (verification.success && (verification.data.status === 'COMPLETE' || verification.data.status === 'COMPLETED')) {
      // Get order
      const orderDoc = await db.collection('orders').doc(orderId).get();
      if (!orderDoc.exists) {
        return res.status(404).json({ error: 'Order not found' });
      }

      const order = orderDoc.data();

      // Process successful payment
      await db.runTransaction(async (transaction) => {
        // Update order — 'processing' until SAPO shipment confirms 'shipped'
        transaction.update(orderDoc.ref, {
          status: 'processing',
          paymentStatus: 'completed',
          paymentReference: transactionId,
          fundsHeld: true, // seller funds held in pendingBalance until delivery
          paidAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Update product status
        const productRef = db.collection('products').doc(order.productId);
        transaction.update(productRef, {
          status: 'sold',
          soldTo: order.buyerId,
          soldAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Hold the seller's net in pendingBalance — released to balance only on delivery.
        const sellerRef = db.collection('users').doc(order.sellerId);
        const platformFee = Number(order.amount) * 0.1;
        const sellerAmount = Number(order.amount) - platformFee;

        transaction.update(sellerRef, {
          pendingBalance: admin.firestore.FieldValue.increment(sellerAmount),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Create transaction records
        const buyerTransactionRef = db.collection('transactions').doc();
        transaction.set(buyerTransactionRef, {
          userId: order.buyerId,
          orderId,
          type: 'purchase',
          amount: -order.amount,
          status: 'completed',
          paymentMethod: 'addpay',
          reference: transactionId,
          description: `Purchase: ${order.productTitle}`,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        const sellerTransactionRef = db.collection('transactions').doc();
        transaction.set(sellerTransactionRef, {
          userId: order.sellerId,
          orderId,
          type: 'sale',
          amount: sellerAmount,
          status: 'completed',
          platformFee,
          description: `Sale: ${order.productTitle}`,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      });

      // Process affiliate commission if buyer was referred
      try {
        await processAffiliateCommission(order.buyerId, orderId, order.amount);
      } catch (commissionError) {
        console.error('Error processing affiliate commission:', commissionError);
      }

      // Create SAPO shipment after successful AddPay payment
      let shippingInfo = null;
      try {
        const updatedOrderDoc = await db.collection('orders').doc(orderId).get();
        const updatedOrder = { id: orderId, ...updatedOrderDoc.data() };

        const shipmentResult = await sapoShippingService.createShipmentForOrder(updatedOrder);
        console.log('SAPO shipment created (AddPay):', shipmentResult.trackingNumber);

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
        console.error('Error creating SAPO shipment (AddPay):', shippingError);
      }

      // Send comprehensive order confirmation email with invoice
      try {
        const buyerDoc = await db.collection('users').doc(order.buyerId).get();
        const sellerDoc = await db.collection('users').doc(order.sellerId).get();
        const finalOrderDoc = await db.collection('orders').doc(orderId).get();
        const finalOrder = { id: orderId, ...finalOrderDoc.data() };

        if (buyerDoc.exists) {
          await emailService.sendOrderConfirmationWithInvoice(buyerDoc.data(), finalOrder, shippingInfo);
        }
        if (sellerDoc.exists) {
          await emailService.sendSaleNotification(sellerDoc.data(), finalOrder);
        }
      } catch (emailError) {
        console.error('Error sending emails (AddPay):', emailError);
      }

      return res.json({
        success: true,
        message: 'Payment verified successfully',
        shipping: shippingInfo
      });
    } else {
      return res.status(400).json({ error: 'Payment verification failed' });
    }
  } catch (error) {
    console.error('AddPay verification error:', error);
    res.status(500).json({ error: 'Failed to verify payment' });
  }
});

module.exports = router;