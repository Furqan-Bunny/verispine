const express = require('express');
const router = express.Router();
const { admin, db } = require('../config/firebase');
const { authMiddleware } = require('../middleware/auth');
const traderoot = require('../services/traderootService');
const sapoShippingService = require('../services/shippingService'); // provider facade (SAPO/ShipLogic)
const emailService = require('../services/resendEmailService');
const { processAffiliateCommission } = require('../utils/affiliateCommission');
const { finalizeProductAfterPurchase } = require('../utils/productPurchase');
const { creditWalletTopup } = require('../utils/walletTopup');
const { v4: uuidv4 } = require('uuid');

const serverUrl = () => (process.env.SERVER_URL || 'https://www.verispinejointcenters.com').replace(/\/+$/, '');
const frontendUrl = () => (process.env.FRONTEND_URL || 'https://www.verispinejointcenters.com').replace(/\/+$/, '');

// Log Traderoot's raw response on initiate calls (success AND failure) so the hosted-page flow is
// visible in logs. Returns the responseCode for a caller-side guard. NOTE: traderootService._post
// returns success=true on any HTTP 200, even when the body's responseCode is NOT '00' — callers
// must guard on the responseCode, not just success.
function logTraderootResult(step, result) {
  const d = (result && result.data) || {};
  console.log(
    `[Traderoot:${step}] httpOk=${!!(result && result.success)} ` +
    `responseCode=${d.responseCode ?? 'n/a'} responseMessage=${d.responseMessage ?? 'n/a'} ` +
    `initiationUrl=${d.peripheryData?.initiationUrl || 'MISSING'}` +
    `${result && result.error ? ` error=${result.error}` : ''}`
  );
  return d.responseCode;
}

// Helper: run the standard post-payment Firestore transaction (same as AddPay)
async function completePayment(orderId, paymentData) {
  const orderDoc = await db.collection('orders').doc(orderId).get();
  if (!orderDoc.exists) throw new Error('Order not found');

  const order = orderDoc.data();
  if (order.paymentStatus === 'completed') {
    console.log('Traderoot: order already paid, skipping:', orderId);
    return { alreadyPaid: true };
  }

  await db.runTransaction(async (transaction) => {
    // Read product first (Firestore requires all reads before writes) so the
    // shared finalize helper can decrement stock for fixed-price sale products.
    const productRef = db.collection('products').doc(order.productId);
    const productSnap = await transaction.get(productRef);
    const productData = productSnap.exists ? productSnap.data() : null;

    transaction.update(orderDoc.ref, {
      status: 'processing',
      paymentStatus: 'completed',
      paymentMethod: 'traderoot',
      fundsHeld: true, // seller funds held in pendingBalance until delivery
      paymentReference: paymentData.transactionId || paymentData.rrn,
      traderootTransactionId: paymentData.transactionId || null,
      traderootRRN: paymentData.rrn || null,
      traderootPaymentToken: paymentData.paymentToken || order.traderootPaymentToken || null,
      paidAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    if (productData) {
      finalizeProductAfterPurchase(transaction, productRef, productData, order);
    }

    // Buyer is charged the full total (item + shipping); the seller's share and the
    // platform fee are computed on the item price only (platform keeps the shipping).
    const chargeAmount = Number(order.totalAmount || order.amount);
    const platformFee = Number(order.amount) * 0.1;
    const sellerAmount = Number(order.amount) - platformFee;
    // Hold the seller's net in pendingBalance — released to balance only on delivery.
    const sellerRef = db.collection('users').doc(order.sellerId);
    transaction.update(sellerRef, {
      pendingBalance: admin.firestore.FieldValue.increment(sellerAmount),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    const buyerTxRef = db.collection('transactions').doc();
    transaction.set(buyerTxRef, {
      userId: order.buyerId,
      orderId,
      type: 'purchase',
      amount: -chargeAmount,
      status: 'completed',
      paymentMethod: 'traderoot',
      reference: paymentData.transactionId || paymentData.rrn,
      description: `Purchase: ${order.productTitle}`,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    const sellerTxRef = db.collection('transactions').doc();
    transaction.set(sellerTxRef, {
      userId: order.sellerId,
      orderId,
      type: 'sale',
      amount: sellerAmount,
      status: 'completed',
      platformFee,
      description: `Sale: ${order.productTitle}`,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    const paymentRef = db.collection('payments').doc();
    transaction.set(paymentRef, {
      orderId,
      userId: order.buyerId,
      amount: chargeAmount,
      currency: 'ZAR',
      method: 'traderoot',
      status: 'completed',
      transactionId: paymentData.transactionId || null,
      rrn: paymentData.rrn || null,
      paymentToken: paymentData.paymentToken || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      completedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });

  console.log('Traderoot: payment completed for order:', orderId);
  return { success: true };
}

// Helper: full post-payment pipeline (ledger + affiliate + shipment + emails). Idempotent — if the
// order is already paid (completePayment short-circuits), the side effects are skipped. Called from
// the settlement webhook and the dev verify fallback.
async function runPostPaymentPipeline(orderId, paymentData) {
  const result = await completePayment(orderId, paymentData);
  if (result.alreadyPaid) return { alreadyProcessed: true };

  const orderAfterPay = (await db.collection('orders').doc(orderId).get()).data();

  // Process affiliate commission (non-fatal)
  try {
    await processAffiliateCommission(orderAfterPay.buyerId, orderId, orderAfterPay.amount);
  } catch (e) { console.error('Traderoot affiliate commission error:', e); }

  // Create shipment via the active provider (SAPO/ShipLogic)
  let shippingInfo = null;
  try {
    const updatedOrder = { id: orderId, ...orderAfterPay };
    const shipmentResult = await sapoShippingService.createShipmentForOrder(updatedOrder);
    console.log('Shipment created (Traderoot):', shipmentResult.trackingNumber);

    await db.collection('orders').doc(orderId).update({
      status: 'shipped',
      trackingNumber: shipmentResult.trackingNumber,
      carrier: shipmentResult.carrier || 'SAPO',
      shippingStatus: 'shipped',
      shippedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    shippingInfo = { trackingNumber: shipmentResult.trackingNumber, carrier: shipmentResult.carrier || 'SAPO', status: 'shipped' };
  } catch (e) { console.error('Shipment error (Traderoot):', e.message); }

  // Send confirmation emails (non-fatal)
  try {
    const userDoc = await db.collection('users').doc(orderAfterPay.buyerId).get();
    const finalOrder = { id: orderId, ...(await db.collection('orders').doc(orderId).get()).data() };
    await emailService.sendOrderConfirmationWithInvoice(userDoc.data(), finalOrder, shippingInfo);
    const sellerDoc = await db.collection('users').doc(orderAfterPay.sellerId).get();
    if (sellerDoc.exists) await emailService.sendSaleNotification(sellerDoc.data(), finalOrder);
  } catch (e) { console.error('Email error (Traderoot):', e); }

  return { shippingInfo };
}

/**
 * POST /api/payments/traderoot/initialize
 * Start an e-Commerce Immediate Payment for an order. Returns a single hosted-page URL that does
 * card entry + 3-D Secure + settlement. The outcome arrives via the notification webhook (settlement)
 * and the browser callback (UX).
 */
router.post('/initialize', authMiddleware, async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ error: 'orderId is required' });

    const orderDoc = await db.collection('orders').doc(orderId).get();
    if (!orderDoc.exists) return res.status(404).json({ error: 'Order not found' });
    const order = orderDoc.data();

    if (order.buyerId !== req.user.uid) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const sessionId = uuidv4();
    const walletId = traderoot.getDigitalWalletId(req.user.uid);
    const rrn = traderoot.generateRRN();
    // Charge the full total (item price + shipping), not just the item price.
    const amountCents = Math.round(Number(order.totalAmount || order.amount) * 100);

    await db.collection('orders').doc(orderId).update({
      traderootSessionId: sessionId,
      traderootWalletId: walletId,
      traderootRRN: rrn,
      paymentMethod: 'traderoot',
      paymentStatus: 'processing',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    const callbackUrl = `${frontendUrl()}/payment/traderoot-callback?orderId=${orderId}`;
    const notificationUrl = `${serverUrl()}/api/payments/traderoot/notification`;

    const result = await traderoot.initiateImmediatePayment({
      sessionId, walletId, amount: amountCents, rrn, callbackUrl, notificationUrl, echoData: orderId
    });

    const rc = logTraderootResult('immediate-init', result);
    if (!result.success) {
      return res.status(400).json({ error: result.error || 'Failed to start payment' });
    }
    if (rc && rc !== '00') {
      return res.status(400).json({ error: result.data?.responseMessage || 'Payment rejected', responseCode: rc });
    }

    const initiationUrl = result.data?.peripheryData?.initiationUrl;
    if (!initiationUrl) {
      return res.status(500).json({ error: 'No initiation URL returned' });
    }

    res.json({ success: true, paymentUrl: initiationUrl });
  } catch (error) {
    console.error('Traderoot initialize error:', error);
    res.status(500).json({ error: 'Payment initialization failed' });
  }
});

/**
 * POST /api/payments/traderoot/verify-payment
 * Called by the browser callback page to confirm settlement (UX). The notification webhook is the
 * authoritative settlement path in production; this reads the order status. In dev only (no public
 * webhook), it settles from the callback's decoded responseCode so localhost testing works.
 */
router.post('/verify-payment', authMiddleware, async (req, res) => {
  try {
    const { orderId, data } = req.body;
    // TEMP capture — full Traderoot callback payload (post-transaction) for debugging with JNZ/Traderoot.
    console.log('[Traderoot:callback-data] orderId=' + orderId + ' data=' + JSON.stringify(data || null));
    if (!orderId) return res.status(400).json({ error: 'orderId is required' });

    const orderDoc = await db.collection('orders').doc(orderId).get();
    if (!orderDoc.exists) return res.status(404).json({ error: 'Order not found' });
    const order = orderDoc.data();
    if (order.buyerId !== req.user.uid) return res.status(403).json({ error: 'Unauthorized' });

    if (order.paymentStatus === 'completed') {
      return res.json({ success: true, status: 'completed' });
    }

    // Settle from the approved Immediate-Payment callback. The callback carries responseCode 00 +
    // transactionId. To stop a forged callback from marking an unpaid order as paid, we bind it to
    // this order's server-generated sessionId and its expected amount. The notification webhook, if
    // it ever arrives, settles the same way and is idempotent (completePayment guards on paymentStatus).
    if (data && data.responseCode === '00') {
      const sessionOk = !order.traderootSessionId || data.sessionId === order.traderootSessionId;
      const expectedCents = Math.round(Number(order.totalAmount || order.amount) * 100);
      const amountOk = data.transactionAmount == null || Number(data.transactionAmount) === expectedCents;
      if (sessionOk && amountOk) {
        await runPostPaymentPipeline(orderId, {
          transactionId: data.transactionId || null,
          rrn: data.retrievalReferenceNumber || order.traderootRRN || null,
          paymentToken: data.paymentToken || null
        });
        return res.json({ success: true, status: 'completed' });
      }
      console.warn(`[Traderoot:verify] callback responseCode 00 but binding failed for order ${orderId} (sessionOk=${sessionOk}, amountOk=${amountOk})`);
    }

    res.json({ success: false, status: order.paymentStatus || 'processing' });
  } catch (error) {
    console.error('Traderoot verify-payment error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

/**
 * POST /api/payments/traderoot/notification
 * Server-to-server webhook from Traderoot — the AUTHORITATIVE settlement signal. Verifies the
 * assurance data, then runs the post-payment pipeline (orders) or credits the wallet (top-ups).
 */
router.post('/notification', async (req, res) => {
  try {
    console.log('Traderoot notification received:', JSON.stringify(req.body).slice(0, 500));

    const data = req.body;
    const echoData = data.echoData;
    const responseCode = data.responseCode;
    console.log(`[Traderoot:notification] echoData=${echoData ?? 'n/a'} responseCode=${responseCode ?? 'n/a'} responseMessage=${data.responseMessage ?? 'n/a'} txnId=${data.transactionId ?? 'n/a'}`);

    if (!echoData) {
      return res.status(200).json({ received: true });
    }

    // Verify the assurance data Traderoot embedded — REQUIRED (reject spoofed settlements).
    // A POST without valid assurance cannot settle an order/top-up.
    if (!data.assuranceData) {
      console.warn('[Traderoot:notification] missing assuranceData — ignoring (possible forgery)');
      return res.status(200).json({ received: true });
    }
    const v = traderoot.verifyNotificationAssurance(data.assuranceData, data.sessionId, {
      merchantId: data.merchantId,
      transactionAmount: data.transactionAmount,
      currencyCode: data.currencyCode,
      rrn: data.retrievalReferenceNumber,
      rrnExtended: data.retrievalReferenceNumberExtended
    });
    if (!v.valid) {
      console.warn('[Traderoot:notification] assurance verification failed:', v.reason);
      return res.status(200).json({ received: true });
    }

    if (responseCode !== '00') {
      // Declined — leave the order/top-up as-is; the browser callback handles the cancel UX.
      return res.status(200).json({ received: true });
    }

    const paymentData = {
      transactionId: data.transactionId || null,
      rrn: data.retrievalReferenceNumber || null,
      paymentToken: data.paymentToken || null
    };

    if (typeof echoData === 'string' && echoData.startsWith('topup:')) {
      const topupId = echoData.slice('topup:'.length);
      await db.collection('walletTopups').doc(topupId).update({
        traderootTransactionId: paymentData.transactionId,
        traderootRRN: paymentData.rrn,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      try { await creditWalletTopup(topupId); }
      catch (e) { console.error('Traderoot topup credit (notification) error:', e.message); }
    } else {
      await runPostPaymentPipeline(echoData, paymentData);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Traderoot notification error:', error);
    res.status(200).json({ received: true }); // Always 200 to prevent retries
  }
});

/**
 * POST /api/payments/traderoot/refund
 * Refund a completed Traderoot payment (admin only)
 */
router.post('/refund', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ error: 'orderId is required' });

    const orderDoc = await db.collection('orders').doc(orderId).get();
    if (!orderDoc.exists) return res.status(404).json({ error: 'Order not found' });
    const order = orderDoc.data();

    if (order.paymentMethod !== 'traderoot' || order.paymentStatus !== 'completed') {
      return res.status(400).json({ error: 'Order is not a completed Traderoot payment' });
    }

    const sessionId = uuidv4();
    // Charge the full total (item price + shipping), not just the item price.
    const amountCents = Math.round(Number(order.totalAmount || order.amount) * 100);
    const rrn = order.traderootRRN || traderoot.generateRRN();

    const result = await traderoot.refundPayment({
      sessionId,
      paymentToken: order.traderootPaymentToken,
      amount: amountCents,
      rrn,
      originalTransactionId: order.traderootTransactionId
    });

    if (!result.success || (result.data?.responseCode && result.data.responseCode !== '00')) {
      return res.status(400).json({
        error: result.data?.responseMessage || result.error || 'Refund failed',
        responseCode: result.data?.responseCode
      });
    }

    // Update order status
    await db.collection('orders').doc(orderId).update({
      status: 'refunded',
      paymentStatus: 'refunded',
      refundedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Reverse any affiliate commission for this refunded order (non-fatal)
    try {
      const { reverseAffiliateCommissionForOrder } = require('../utils/affiliateCommission');
      await reverseAffiliateCommissionForOrder(orderId);
    } catch (e) { console.error('Affiliate reverse (traderoot refund) error:', e.message); }

    res.json({ success: true, message: 'Refund processed' });
  } catch (error) {
    console.error('Traderoot refund error:', error);
    res.status(500).json({ error: 'Refund failed' });
  }
});

// ============================================================================
// Wallet top-up via Traderoot (e-Commerce Immediate Payment)
// Mirrors the order flow but keyed on a walletTopups doc; credits the wallet on success.
// ============================================================================

async function loadTopup(topupId, userId) {
  const ref = db.collection('walletTopups').doc(topupId);
  const snap = await ref.get();
  if (!snap.exists) { const e = new Error('Top-up not found'); e.status = 404; throw e; }
  const topup = snap.data();
  if (topup.userId !== userId) { const e = new Error('Unauthorized'); e.status = 403; throw e; }
  return { ref, topup };
}

/**
 * POST /api/payments/traderoot/topup/initialize
 * Start an Immediate Payment for a wallet top-up. Returns the single hosted-page URL.
 */
router.post('/topup/initialize', authMiddleware, async (req, res) => {
  try {
    const { topupId } = req.body;
    if (!topupId) return res.status(400).json({ error: 'topupId is required' });

    const { ref, topup } = await loadTopup(topupId, req.user.uid);
    const sessionId = uuidv4();
    const walletId = traderoot.getDigitalWalletId(req.user.uid);
    const rrn = traderoot.generateRRN();
    const amountCents = Math.round(Number(topup.amount) * 100);

    await ref.update({
      traderootSessionId: sessionId,
      traderootWalletId: walletId,
      traderootRRN: rrn,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    const callbackUrl = `${frontendUrl()}/payment/traderoot-callback?topupId=${topupId}`;
    const notificationUrl = `${serverUrl()}/api/payments/traderoot/notification`;

    const result = await traderoot.initiateImmediatePayment({
      sessionId, walletId, amount: amountCents, rrn, callbackUrl, notificationUrl, echoData: `topup:${topupId}`
    });

    const rc = logTraderootResult('topup-immediate-init', result);
    if (!result.success) return res.status(400).json({ error: result.error || 'Failed to start top-up' });
    if (rc && rc !== '00') return res.status(400).json({ error: result.data?.responseMessage || 'Top-up rejected', responseCode: rc });

    const initiationUrl = result.data?.peripheryData?.initiationUrl;
    if (!initiationUrl) return res.status(500).json({ error: 'No initiation URL returned' });

    res.json({ success: true, paymentUrl: initiationUrl });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Traderoot topup initialize error:', error);
    res.status(500).json({ error: 'Top-up initialization failed' });
  }
});

/**
 * POST /api/payments/traderoot/topup/verify
 * Browser-callback confirmation for a top-up. Webhook is authoritative in prod; dev settles from
 * the callback's responseCode so localhost testing works.
 */
router.post('/topup/verify', authMiddleware, async (req, res) => {
  try {
    const { topupId, data } = req.body;
    // TEMP capture — full Traderoot callback payload (post-transaction) for debugging with JNZ/Traderoot.
    console.log('[Traderoot:callback-data] topupId=' + topupId + ' data=' + JSON.stringify(data || null));
    if (!topupId) return res.status(400).json({ error: 'topupId is required' });

    const { ref, topup } = await loadTopup(topupId, req.user.uid);
    if (topup.status === 'completed') {
      return res.json({ success: true, status: 'completed' });
    }

    // Settle the top-up from the approved callback, bound to this top-up's session + amount.
    if (data && data.responseCode === '00') {
      const sessionOk = !topup.traderootSessionId || data.sessionId === topup.traderootSessionId;
      const expectedCents = Math.round(Number(topup.amount) * 100);
      const amountOk = data.transactionAmount == null || Number(data.transactionAmount) === expectedCents;
      if (sessionOk && amountOk) {
        await ref.update({
          traderootTransactionId: data.transactionId || null,
          traderootRRN: data.retrievalReferenceNumber || topup.traderootRRN || null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        const credit = await creditWalletTopup(topupId);
        return res.json({ success: true, status: 'completed', amount: credit.amount });
      }
      console.warn(`[Traderoot:verify] topup callback 00 but binding failed for ${topupId} (sessionOk=${sessionOk}, amountOk=${amountOk})`);
    }

    res.json({ success: false, status: topup.status || 'pending' });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Traderoot topup verify error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

module.exports = router;
