const express = require('express');
const router = express.Router();
const { admin, db } = require('../config/firebase');
const { authMiddleware } = require('../middleware/auth');
const shippingService = require('../services/shippingService');
const emailService = require('../services/resendEmailService');
const { processAffiliateCommission } = require('../utils/affiliateCommission');
const { finalizeProductAfterPurchase } = require('../utils/productPurchase');
const { creditWalletTopup } = require('../utils/walletTopup');
const { PLATFORM_FEE_RATE } = require('../utils/sellerPayout');
const { CURRENCY } = require('../utils/locale');

/**
 * Stripe payments (Checkout Sessions + webhook).
 *
 * Shape mirrors the settlement contract the rest of the app already relies on:
 * the webhook is AUTHORITATIVE, the browser return is UX only, and settlement
 * runs through one idempotent pipeline so a replayed event cannot double-credit.
 */

const stripeSecret = process.env.STRIPE_SECRET_KEY || '';
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
// Mock mode lets the whole flow be exercised (and the server boot) before the
// client's Stripe account exists.
const MOCK = process.env.STRIPE_MOCK_MODE === 'true' || !stripeSecret;

const stripe = MOCK ? null : require('stripe')(stripeSecret);

const frontendUrl = () => (process.env.FRONTEND_URL || 'https://marketplace.verispinejointcenters.com').replace(/\/+$/, '');
const serverUrl = () => (process.env.SERVER_URL || 'https://marketplace.verispinejointcenters.com').replace(/\/+$/, '');

/** Stripe works in the smallest currency unit. USD -> cents. */
const toMinorUnits = (amount) => Math.round(Number(amount) * 100);

// ---------------------------------------------------------------------------
// Settlement
// ---------------------------------------------------------------------------

/**
 * Ledger writes for a paid order, in one transaction.
 *
 * Idempotent: short-circuits if the order is already marked paid, so a Stripe
 * webhook retry (or a race with the browser-return verify) cannot credit the
 * seller twice.
 */
async function completePayment(orderId, paymentData) {
  const orderRef = db.collection('orders').doc(orderId);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) throw new Error('Order not found');

  const order = orderSnap.data();
  if (order.paymentStatus === 'completed' || order.paymentStatus === 'paid') {
    console.log('Stripe: order already paid, skipping:', orderId);
    return { alreadyPaid: true };
  }

  await db.runTransaction(async (transaction) => {
    // All reads before any writes (Firestore requirement).
    const productRef = db.collection('products').doc(order.productId);
    const productSnap = await transaction.get(productRef);
    const productData = productSnap.exists ? productSnap.data() : null;

    transaction.update(orderRef, {
      status: 'processing',
      paymentStatus: 'completed',
      paymentMethod: 'stripe',
      fundsHeld: true, // seller net sits in pendingBalance until delivery
      paymentReference: paymentData.paymentIntentId || paymentData.sessionId,
      stripeSessionId: paymentData.sessionId || null,
      stripePaymentIntentId: paymentData.paymentIntentId || null,
      paidAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (productData) {
      // Marks sold (auction/buy-now) or decrements stock (fixed-price sale).
      // Throws OUT_OF_STOCK inside the transaction if it would oversell.
      finalizeProductAfterPurchase(transaction, productRef, productData, order);
    }

    // Buyer is charged item + shipping; the platform fee is taken on the item
    // price only, so the platform absorbs no shipping and the seller none of it.
    const chargeAmount = Number(order.totalAmount || order.amount);
    const platformFee = Number(order.amount) * PLATFORM_FEE_RATE;
    const sellerAmount = Number(order.amount) - platformFee;

    transaction.update(db.collection('users').doc(order.sellerId), {
      pendingBalance: admin.firestore.FieldValue.increment(sellerAmount),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const buyerTxRef = db.collection('transactions').doc();
    transaction.set(buyerTxRef, {
      id: buyerTxRef.id,
      userId: order.buyerId,
      orderId,
      type: 'purchase',
      amount: -chargeAmount,
      status: 'completed',
      paymentMethod: 'stripe',
      reference: paymentData.paymentIntentId || paymentData.sessionId,
      description: `Purchase: ${order.productTitle}`,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const sellerTxRef = db.collection('transactions').doc();
    transaction.set(sellerTxRef, {
      id: sellerTxRef.id,
      userId: order.sellerId,
      orderId,
      type: 'sale',
      amount: sellerAmount,
      status: 'completed',
      platformFee,
      description: `Sale: ${order.productTitle} (held until delivery)`,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const paymentRef = db.collection('payments').doc();
    transaction.set(paymentRef, {
      id: paymentRef.id,
      orderId,
      userId: order.buyerId,
      amount: chargeAmount,
      currency: CURRENCY,
      method: 'stripe',
      status: 'completed',
      sessionId: paymentData.sessionId || null,
      paymentIntentId: paymentData.paymentIntentId || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  console.log('Stripe: payment completed for order:', orderId);
  return { success: true };
}

/**
 * Full post-payment pipeline: ledger, then affiliate commission, shipment and
 * emails. Each side effect is non-fatal — a failed email must never undo a
 * successful payment.
 */
async function runPostPaymentPipeline(orderId, paymentData) {
  const result = await completePayment(orderId, paymentData);
  if (result.alreadyPaid) return { alreadyProcessed: true };

  const order = (await db.collection('orders').doc(orderId).get()).data();

  try {
    await processAffiliateCommission(order.buyerId, orderId, order.amount);
  } catch (e) { console.error('Stripe affiliate commission error:', e.message); }

  let shippingInfo = null;
  try {
    const shipment = await shippingService.createShipmentForOrder({ id: orderId, ...order });
    await db.collection('orders').doc(orderId).update({
      status: 'shipped',
      trackingNumber: shipment.trackingNumber,
      carrier: shipment.carrier,
      shippingStatus: 'shipped',
      shippedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    shippingInfo = { trackingNumber: shipment.trackingNumber, carrier: shipment.carrier, status: 'shipped' };
  } catch (e) {
    console.error('Shipment error (Stripe):', e.message);
    // Persist so an admin can retry; the order stays at 'processing'.
    await db.collection('orders').doc(orderId).update({
      shippingError: e.message,
      shippingErrorAt: admin.firestore.FieldValue.serverTimestamp(),
    }).catch(() => {});
  }

  try {
    const buyer = (await db.collection('users').doc(order.buyerId).get()).data();
    const finalOrder = { id: orderId, ...(await db.collection('orders').doc(orderId).get()).data() };
    if (buyer) await emailService.sendOrderConfirmationWithInvoice(buyer, finalOrder, shippingInfo);
    const sellerSnap = await db.collection('users').doc(order.sellerId).get();
    if (sellerSnap.exists) await emailService.sendSaleNotification(sellerSnap.data(), finalOrder);
  } catch (e) { console.error('Email error (Stripe):', e.message); }

  return { shippingInfo };
}

// ---------------------------------------------------------------------------
// Order checkout
// ---------------------------------------------------------------------------

/**
 * POST /api/payments/stripe/create-session  { orderId }
 * Returns a hosted Stripe Checkout URL. The amount is taken from the ORDER,
 * never from the client, so a tampered request cannot lower the charge.
 */
router.post('/create-session', authMiddleware, async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ error: 'orderId is required' });

    const orderSnap = await db.collection('orders').doc(orderId).get();
    if (!orderSnap.exists) return res.status(404).json({ error: 'Order not found' });
    const order = orderSnap.data();

    if (order.buyerId !== req.user.uid) return res.status(403).json({ error: 'Unauthorized' });
    if (order.paymentStatus === 'completed' || order.paymentStatus === 'paid') {
      return res.status(400).json({ error: 'Order is already paid' });
    }

    const amount = Number(order.totalAmount || order.amount);
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Order amount is invalid' });

    if (MOCK) {
      // Settle immediately so the rest of the flow can be tested end-to-end
      // without a Stripe account.
      await runPostPaymentPipeline(orderId, { sessionId: `mock_${Date.now()}`, paymentIntentId: null });
      return res.json({ success: true, mock: true, paymentUrl: `${frontendUrl()}/payment/success?order_id=${orderId}&method=stripe` });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      client_reference_id: orderId,
      customer_email: order.buyerEmail || undefined,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: CURRENCY.toLowerCase(),
          unit_amount: toMinorUnits(amount),
          product_data: {
            name: order.productTitle || 'Order',
            description: `Order ${orderId}`,
          },
        },
      }],
      // metadata is what the webhook routes on — keep it authoritative.
      metadata: { kind: 'order', orderId },
      payment_intent_data: { metadata: { kind: 'order', orderId } },
      success_url: `${frontendUrl()}/payment/success?order_id=${orderId}&method=stripe&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl()}/payment/cancel?order_id=${orderId}`,
    });

    await db.collection('orders').doc(orderId).update({
      paymentMethod: 'stripe',
      paymentStatus: 'processing',
      stripeSessionId: session.id,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ success: true, paymentUrl: session.url, sessionId: session.id });
  } catch (error) {
    console.error('Stripe create-session error:', error);
    res.status(500).json({ error: 'Failed to start payment' });
  }
});

/**
 * POST /api/payments/stripe/verify  { orderId }
 * Browser-return confirmation. The webhook is authoritative; this only reports
 * status, and re-checks Stripe directly if the webhook has not landed yet.
 */
router.post('/verify', authMiddleware, async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ error: 'orderId is required' });

    const orderSnap = await db.collection('orders').doc(orderId).get();
    if (!orderSnap.exists) return res.status(404).json({ error: 'Order not found' });
    const order = orderSnap.data();
    if (order.buyerId !== req.user.uid) return res.status(403).json({ error: 'Unauthorized' });

    if (order.paymentStatus === 'completed' || order.paymentStatus === 'paid') {
      return res.json({ success: true, status: 'completed' });
    }

    // Webhook may not have arrived yet — ask Stripe directly rather than
    // trusting anything the browser sent us.
    if (!MOCK && order.stripeSessionId) {
      const session = await stripe.checkout.sessions.retrieve(order.stripeSessionId);
      if (session && session.payment_status === 'paid') {
        await runPostPaymentPipeline(orderId, {
          sessionId: session.id,
          paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id || null,
        });
        return res.json({ success: true, status: 'completed' });
      }
    }

    res.json({ success: false, status: order.paymentStatus || 'processing' });
  } catch (error) {
    console.error('Stripe verify error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// ---------------------------------------------------------------------------
// Wallet top-up
// ---------------------------------------------------------------------------

router.post('/topup/create-session', authMiddleware, async (req, res) => {
  try {
    const { topupId } = req.body;
    if (!topupId) return res.status(400).json({ error: 'topupId is required' });

    const ref = db.collection('walletTopups').doc(topupId);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Top-up not found' });
    const topup = snap.data();
    if (topup.userId !== req.user.uid) return res.status(403).json({ error: 'Unauthorized' });
    if (topup.status === 'completed') return res.status(400).json({ error: 'Top-up already completed' });

    if (MOCK) {
      await creditWalletTopup(topupId);
      return res.json({ success: true, mock: true, paymentUrl: `${frontendUrl()}/wallet?topup=success` });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      client_reference_id: topupId,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: CURRENCY.toLowerCase(),
          unit_amount: toMinorUnits(topup.amount),
          product_data: { name: 'VeriSpine wallet top-up' },
        },
      }],
      metadata: { kind: 'topup', topupId },
      payment_intent_data: { metadata: { kind: 'topup', topupId } },
      success_url: `${frontendUrl()}/wallet?topup=verify&topup_id=${topupId}`,
      cancel_url: `${frontendUrl()}/wallet?topup=cancelled`,
    });

    await ref.update({ stripeSessionId: session.id, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    res.json({ success: true, paymentUrl: session.url });
  } catch (error) {
    console.error('Stripe topup create-session error:', error);
    res.status(500).json({ error: 'Failed to start top-up' });
  }
});

// ---------------------------------------------------------------------------
// Webhook — the authoritative settlement path
// ---------------------------------------------------------------------------

/**
 * POST /api/payments/stripe/webhook
 *
 * Requires the RAW body for signature verification — server.js mounts
 * express.raw() for this exact path BEFORE express.json(). If that mount is
 * ever removed, every event will fail verification.
 */
router.post('/webhook', async (req, res) => {
  let event = req.body;

  if (!MOCK && webhookSecret) {
    const signature = req.headers['stripe-signature'];
    try {
      event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
    } catch (err) {
      // A bad signature means the caller is not Stripe. Reject loudly.
      console.error('Stripe webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
  } else if (Buffer.isBuffer(event)) {
    try { event = JSON.parse(event.toString('utf8')); } catch { event = {}; }
  }

  // Acknowledge fast; Stripe retries on non-2xx and we do not want a slow
  // pipeline to trigger duplicate deliveries.
  res.status(200).json({ received: true });

  try {
    if (event.type !== 'checkout.session.completed' && event.type !== 'checkout.session.async_payment_succeeded') {
      return;
    }

    const session = event.data.object;
    if (session.payment_status !== 'paid') return;

    const meta = session.metadata || {};
    const paymentIntentId = typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id || null;

    if (meta.kind === 'topup' && meta.topupId) {
      await db.collection('walletTopups').doc(meta.topupId).update({
        stripePaymentIntentId: paymentIntentId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }).catch(() => {});
      await creditWalletTopup(meta.topupId);
    } else if (meta.orderId || session.client_reference_id) {
      await runPostPaymentPipeline(meta.orderId || session.client_reference_id, {
        sessionId: session.id,
        paymentIntentId,
      });
    }
  } catch (error) {
    console.error('Stripe webhook processing error:', error);
  }
});

// ---------------------------------------------------------------------------
// Refund (admin)
// ---------------------------------------------------------------------------

router.post('/refund', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ error: 'orderId is required' });

    const orderSnap = await db.collection('orders').doc(orderId).get();
    if (!orderSnap.exists) return res.status(404).json({ error: 'Order not found' });
    const order = orderSnap.data();

    if (order.paymentMethod !== 'stripe' || order.paymentStatus !== 'completed') {
      return res.status(400).json({ error: 'Order is not a completed Stripe payment' });
    }

    if (!MOCK) {
      if (!order.stripePaymentIntentId) {
        return res.status(400).json({ error: 'No payment intent recorded for this order' });
      }
      await stripe.refunds.create({ payment_intent: order.stripePaymentIntentId });
    }

    await db.collection('orders').doc(orderId).update({
      status: 'refunded',
      paymentStatus: 'refunded',
      refundedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Claw back any affiliate commission tied to this order.
    try {
      const { reverseAffiliateCommissionForOrder } = require('../utils/affiliateCommission');
      await reverseAffiliateCommissionForOrder(orderId);
    } catch (e) { console.error('Affiliate reverse (stripe refund) error:', e.message); }

    res.json({ success: true, message: 'Refund processed' });
  } catch (error) {
    console.error('Stripe refund error:', error);
    res.status(500).json({ error: 'Refund failed' });
  }
});

module.exports = router;
module.exports.runPostPaymentPipeline = runPostPaymentPipeline;
