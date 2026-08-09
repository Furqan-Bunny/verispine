const { admin, db } = require('../config/firebase');

// Unified platform fee. Seller receives (1 - PLATFORM_FEE_RATE) of the item price.
// Kept here so settlement (hold) and delivery (release) always agree on the amount.
const PLATFORM_FEE_RATE = 0.10; // 10%

/**
 * Release a seller's held funds (pendingBalance -> balance) when an order is delivered.
 *
 * Seller funds are HELD in pendingBalance at payment and only become withdrawable when
 * the order is marked delivered by the system/admin (never by the seller). This is the
 * single place that moves them.
 *
 * Idempotent and safe to call from multiple delivered transitions (admin status update,
 * admin mark-delivered, carrier webhook):
 *  - only acts on orders settled under the held-funds model (`fundsHeld === true`)
 *  - skips if already released (`sellerFundsReleased === true`)
 *  - never acts on legacy/old-model orders (no `fundsHeld`), so they can't be double-paid
 *
 * @param {string} orderId
 * @returns {Promise<{released:boolean, reason?:string, sellerNet?:number}>}
 */
async function releaseSellerFundsOnDelivery(orderId) {
  return db.runTransaction(async (tx) => {
    const ref = db.collection('orders').doc(orderId);
    const snap = await tx.get(ref);
    if (!snap.exists) return { released: false, reason: 'order_not_found' };

    const order = snap.data();
    if (order.sellerFundsReleased) return { released: false, reason: 'already_released' };
    if (!order.fundsHeld) return { released: false, reason: 'not_held' }; // legacy / old-model order
    if (!order.sellerId) return { released: false, reason: 'no_seller' };
    if (order.paymentStatus !== 'completed' && order.paymentStatus !== 'paid') {
      return { released: false, reason: 'not_paid' };
    }

    const sellerNet = Number(order.amount) * (1 - PLATFORM_FEE_RATE);
    const sellerRef = db.collection('users').doc(order.sellerId);
    tx.update(sellerRef, {
      pendingBalance: admin.firestore.FieldValue.increment(-sellerNet),
      balance: admin.firestore.FieldValue.increment(sellerNet),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    tx.update(ref, {
      sellerFundsReleased: true,
      sellerFundsReleasedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return { released: true, sellerNet };
  });
}

module.exports = { releaseSellerFundsOnDelivery, PLATFORM_FEE_RATE };
