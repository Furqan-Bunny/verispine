const { admin, db } = require('../config/firebase');

// Commission rate - 5% of purchase amount
const COMMISSION_RATE = 0.05;

// An order counts as a "purchase" once it's paid (mirrors admin-sellers revenue logic).
const PAID_ORDER_STATUSES = new Set(['paid', 'processing', 'shipped', 'delivered']);
const PAID_PAYMENT_STATUSES = new Set(['paid', 'completed']);
function isPaidOrder(o) {
  return PAID_ORDER_STATUSES.has(o.status) || PAID_PAYMENT_STATUSES.has(o.paymentStatus);
}

/**
 * Aggregate a referrer's downstream activity: who they referred and what those users bought.
 * Used by both the affiliate-facing and admin routes. Queries are single-field equality
 * (referredBy) + buyerId `in` chunks of 30 — no composite index needed.
 * @param {string} affiliateId
 * @returns {Promise<{referredUserIds: string[], referredUsersCount: number, referralPurchases: number, grossReferralSales: number}>}
 */
async function computeReferralAggregates(affiliateId) {
  const usersSnap = await db.collection('users').where('referredBy', '==', affiliateId).get();
  const referredUserIds = usersSnap.docs.map(d => d.id);

  let referralPurchases = 0;
  let grossReferralSales = 0;
  for (let i = 0; i < referredUserIds.length; i += 30) {
    const chunk = referredUserIds.slice(i, i + 30);
    if (!chunk.length) break;
    const ordersSnap = await db.collection('orders').where('buyerId', 'in', chunk).get();
    ordersSnap.forEach(doc => {
      const o = doc.data();
      if (isPaidOrder(o)) {
        referralPurchases++;
        grossReferralSales += parseFloat(o.amount) || 0;
      }
    });
  }

  return {
    referredUserIds,
    referredUsersCount: referredUserIds.length,
    referralPurchases,
    grossReferralSales
  };
}

/**
 * Process affiliate commission when a referred user makes a purchase
 * @param {string} buyerId - The user who made the purchase
 * @param {string} orderId - The order ID
 * @param {number} purchaseAmount - The total purchase amount
 * @returns {Promise<{success: boolean, commission?: number, referrerId?: string, error?: string}>}
 */
async function processAffiliateCommission(buyerId, orderId, purchaseAmount) {
  try {
    console.log('=== AFFILIATE COMMISSION PROCESSING ===');
    console.log('BuyerId:', buyerId);
    console.log('OrderId:', orderId);
    console.log('PurchaseAmount:', purchaseAmount);

    // Get buyer's document to check if they were referred
    const buyerDoc = await db.collection('users').doc(buyerId).get();

    if (!buyerDoc.exists) {
      console.log('Buyer not found');
      return { success: false, error: 'Buyer not found' };
    }

    const buyerData = buyerDoc.data();
    const referrerId = buyerData.referredBy;

    // Check if buyer was referred by someone
    if (!referrerId) {
      console.log('Buyer was not referred by anyone - no commission');
      return { success: true, commission: 0, message: 'No referrer' };
    }

    console.log('Referrer found:', referrerId);

    // Check if commission already processed for this order
    const existingCommission = await db.collection('affiliateCommissions')
      .where('orderId', '==', orderId)
      .limit(1)
      .get();

    if (!existingCommission.empty) {
      console.log('Commission already processed for this order');
      return { success: true, commission: 0, message: 'Already processed' };
    }

    // Get referrer's document
    const referrerDoc = await db.collection('users').doc(referrerId).get();

    if (!referrerDoc.exists) {
      console.log('Referrer not found');
      return { success: false, error: 'Referrer not found' };
    }

    // Only ACTIVATED affiliates (KYC-approved → isAffiliate) earn commission.
    // The referredBy link still exists; it simply pays nothing unless the referrer
    // has activated the affiliate program.
    if (referrerDoc.data().isAffiliate !== true) {
      console.log('Referrer is not an active affiliate — no commission');
      return { success: true, commission: 0, message: 'Referrer not an active affiliate' };
    }

    // Calculate commission
    const commissionAmount = Math.round(Number(purchaseAmount) * COMMISSION_RATE * 100) / 100; // Round to 2 decimal places
    console.log('Commission amount (5%):', commissionAmount);

    // Hold the commission as PENDING — credited to the referrer's pendingBalance (not
    // spendable). It's released to the spendable balance only when the order is delivered
    // (releaseAffiliateCommissionForOrder), and removed if the order is cancelled/refunded
    // (reverseAffiliateCommissionForOrder). No spendable `transactions` record is written
    // here — that happens at release time.
    await db.runTransaction(async (transaction) => {
      const referrerDocInTx = await transaction.get(referrerDoc.ref);
      const currentPending = Number(referrerDocInTx.data().pendingBalance || 0);

      transaction.update(referrerDoc.ref, {
        pendingBalance: currentPending + commissionAmount,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      const commissionRef = db.collection('affiliateCommissions').doc();
      transaction.set(commissionRef, {
        id: commissionRef.id,
        referrerId: referrerId,
        referredUserId: buyerId,
        orderId: orderId,
        purchaseAmount: purchaseAmount,
        commissionRate: COMMISSION_RATE,
        commissionAmount: commissionAmount,
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });

    console.log('Commission held as pending!');
    console.log('=== AFFILIATE COMMISSION COMPLETE ===');

    return {
      success: true,
      commission: commissionAmount,
      referrerId: referrerId,
      status: 'pending'
    };

  } catch (error) {
    console.error('Error processing affiliate commission:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Release an order's pending affiliate commission to the referrer's spendable balance.
 * Called when the order is DELIVERED. Idempotent (only acts on 'pending' rows).
 * @param {string} orderId
 */
async function releaseAffiliateCommissionForOrder(orderId) {
  try {
    const snap = await db.collection('affiliateCommissions')
      .where('orderId', '==', orderId)
      .where('status', '==', 'pending')
      .get();
    if (snap.empty) return { success: true, released: 0 };

    let released = 0;
    for (const doc of snap.docs) {
      const c = doc.data();
      await db.runTransaction(async (transaction) => {
        const commRef = doc.ref;
        const commInTx = await transaction.get(commRef);
        if (!commInTx.exists || commInTx.data().status !== 'pending') return; // already handled

        const referrerRef = db.collection('users').doc(c.referrerId);
        const referrerInTx = await transaction.get(referrerRef);
        const amount = Number(c.commissionAmount || 0);
        const pending = Number((referrerInTx.exists ? referrerInTx.data().pendingBalance : 0) || 0);
        const balance = Number((referrerInTx.exists ? referrerInTx.data().balance : 0) || 0);
        const owed = Number((referrerInTx.exists ? referrerInTx.data().owedFromReversals : 0) || 0);
        const now = admin.firestore.FieldValue.serverTimestamp();

        // If the referrer owes from a previous clawback, settle that debt first;
        // only the remainder becomes spendable. Keeps reversed-after-withdrawal recoverable.
        const settled = Math.min(amount, owed);
        const creditToBalance = amount - settled;

        if (referrerInTx.exists) {
          transaction.update(referrerRef, {
            pendingBalance: Math.max(0, pending - amount),
            balance: balance + creditToBalance,
            owedFromReversals: Math.max(0, owed - settled),
            updatedAt: now
          });
        }
        transaction.update(commRef, { status: 'credited', releasedAt: now });

        // Now it's real, spendable money — write the wallet transaction record.
        // amount reflects the actual balance delta; settledDebt notes any debt repaid.
        const txRef = db.collection('transactions').doc();
        transaction.set(txRef, {
          id: txRef.id,
          userId: c.referrerId,
          type: 'affiliate_commission',
          amount: creditToBalance,
          settledDebt: settled,
          status: 'completed',
          description: settled > 0
            ? `Commission released from delivered order (Order: ${orderId}); $${settled.toFixed(2)} applied to prior reversal debt`
            : `Commission released from delivered order (Order: ${orderId})`,
          orderId,
          referredUserId: c.referredUserId,
          createdAt: now
        });
      });
      released += Number(c.commissionAmount || 0);
    }
    console.log(`Affiliate: released commission for order ${orderId}: $${released}`);
    return { success: true, released };
  } catch (error) {
    console.error('Error releasing affiliate commission:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Reverse an order's affiliate commission when the order is CANCELLED/REFUNDED.
 * Removes pending commission, or claws back already-released commission from balance.
 * Idempotent (acts only on 'pending'/'credited' rows).
 * @param {string} orderId
 */
async function reverseAffiliateCommissionForOrder(orderId) {
  try {
    const snap = await db.collection('affiliateCommissions')
      .where('orderId', '==', orderId)
      .get();
    if (snap.empty) return { success: true, reversed: 0 };

    let reversed = 0;
    for (const doc of snap.docs) {
      const c = doc.data();
      if (c.status !== 'pending' && c.status !== 'credited') continue; // already reversed
      await db.runTransaction(async (transaction) => {
        const commRef = doc.ref;
        const commInTx = await transaction.get(commRef);
        const status = commInTx.exists ? commInTx.data().status : null;
        if (status !== 'pending' && status !== 'credited') return; // already handled

        const referrerRef = db.collection('users').doc(c.referrerId);
        const referrerInTx = await transaction.get(referrerRef);
        const amount = Number(c.commissionAmount || 0);
        const now = admin.firestore.FieldValue.serverTimestamp();

        // recovered = amount actually pulled back from spendable balance; owed = the
        // shortfall recorded as a debt (settled against future commissions, never a
        // negative wallet balance).
        let recovered = 0;
        let owedAdded = 0;
        if (referrerInTx.exists) {
          if (status === 'pending') {
            // Never released — just drop the held amount.
            const pending = Number(referrerInTx.data().pendingBalance || 0);
            transaction.update(referrerRef, { pendingBalance: Math.max(0, pending - amount), updatedAt: now });
          } else {
            // Already released to spendable balance. Claw back what's available; clamp at
            // 0 and record any shortfall as owedFromReversals (the referrer already withdrew).
            const balance = Number(referrerInTx.data().balance || 0);
            const owed = Number(referrerInTx.data().owedFromReversals || 0);
            recovered = Math.min(amount, Math.max(0, balance));
            owedAdded = amount - recovered;
            transaction.update(referrerRef, {
              balance: balance - recovered,
              owedFromReversals: owed + owedAdded,
              updatedAt: now
            });
          }
        }
        transaction.update(commRef, { status: 'reversed', reversedAt: now });

        // Audit record — amount is the full reversal; recovered/owed show how it was settled.
        const txRef = db.collection('transactions').doc();
        transaction.set(txRef, {
          id: txRef.id,
          userId: c.referrerId,
          type: 'affiliate_commission_reversal',
          amount: -amount,
          recovered,
          owed: owedAdded,
          status: 'completed',
          description: owedAdded > 0
            ? `Commission reversed (order ${orderId} cancelled/refunded); $${owedAdded.toFixed(2)} recorded as debt (balance was insufficient)`
            : `Commission reversed (order ${orderId} cancelled/refunded)`,
          orderId,
          referredUserId: c.referredUserId,
          createdAt: now
        });
      });
      reversed += Number(c.commissionAmount || 0);
    }
    console.log(`Affiliate: reversed commission for order ${orderId}: $${reversed}`);
    return { success: true, reversed };
  } catch (error) {
    console.error('Error reversing affiliate commission:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Single source of truth for a referrer's commission totals. Used by both the
 * affiliate-facing /affiliate/stats route and the admin affiliate routes.
 * No orderBy — sorted/aggregated in memory so no composite index is needed.
 * @param {string} userId - The affiliate (referrer) user ID
 * @returns {Promise<{totalEarned: number, pendingCommission: number, reversedCount: number, owedFromReversals: number, totalCommissionOrders: number}>}
 */
async function computeAffiliateSummary(userId) {
  let totalEarned = 0;       // released (spendable) commission
  let pendingCommission = 0; // held, not yet released
  let reversedCount = 0;
  let totalCommissionOrders = 0;

  try {
    const snap = await db.collection('affiliateCommissions')
      .where('referrerId', '==', userId)
      .get();
    snap.forEach(doc => {
      const c = doc.data();
      const amt = Number(c.commissionAmount || 0);
      totalCommissionOrders++;
      if (c.status === 'credited') totalEarned += amt;
      else if (c.status === 'pending') pendingCommission += amt;
      else if (c.status === 'reversed') reversedCount++;
    });
  } catch (error) {
    console.error('Error computing affiliate summary:', error);
  }

  // owedFromReversals is tracked on the user doc (debt from clawbacks).
  let owedFromReversals = 0;
  try {
    const u = await db.collection('users').doc(userId).get();
    if (u.exists) owedFromReversals = Number(u.data().owedFromReversals || 0);
  } catch (_) { /* non-fatal */ }

  return { totalEarned, pendingCommission, reversedCount, owedFromReversals, totalCommissionOrders };
}

module.exports = {
  processAffiliateCommission,
  releaseAffiliateCommissionForOrder,
  reverseAffiliateCommissionForOrder,
  computeAffiliateSummary,
  computeReferralAggregates,
  isPaidOrder,
  COMMISSION_RATE
};
