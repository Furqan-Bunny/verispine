/**
 * Admin hard-delete helpers with per-entity cascades. Shared by the generic
 * POST /api/admin-ext/bulk-delete endpoint and the single-user delete route.
 *
 * All deletes are PERMANENT (hard delete) — admin-only, confirmed in the UI.
 */
const { admin, db, auth } = require('../config/firebase');

const DEL = () => admin.firestore.FieldValue.delete();
const DEC = (n) => admin.firestore.FieldValue.increment(n);

// Delete every doc in `collection` where `field == value`, chunked under the 500-op batch limit.
async function deleteWhere(collection, field, value) {
  const snap = await db.collection(collection).where(field, '==', value).get();
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += 450) {
    const batch = db.batch();
    docs.slice(i, i + 450).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  return docs.length;
}

// Full user removal: Firebase Auth account + user doc + the user's footprint.
async function deleteUserFully(userId) {
  const userRef = db.collection('users').doc(userId);
  const snap = await userRef.get();
  if (!snap.exists) throw new Error('User not found');
  const u = snap.data();
  if (u.role === 'admin') throw new Error('Cannot delete an admin user');

  // 1) Firebase Auth account. The Firestore doc id may equal the Auth uid, or a `uid` field holds
  //    it; if neither works, fall back to looking the account up by email. Non-fatal.
  if (auth) {
    const uid = u.uid || userId;
    try {
      await auth.deleteUser(uid);
    } catch (e) {
      let done = false;
      if (u.email) {
        try {
          const rec = await auth.getUserByEmail(u.email);
          await auth.deleteUser(rec.uid);
          done = true;
        } catch (_) { /* fall through */ }
      }
      if (!done) console.error(`[adminDelete] Auth delete failed for ${userId}:`, e.code || e.message);
    }
  }

  // 2) Their products, and each product's bids.
  const prodSnap = await db.collection('products').where('sellerId', '==', userId).get();
  for (const p of prodSnap.docs) await deleteWhere('bids', 'productId', p.id);
  for (let i = 0; i < prodSnap.docs.length; i += 450) {
    const batch = db.batch();
    prodSnap.docs.slice(i, i + 450).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }

  // 3) Other user-keyed data (bids they placed, reviews, notifications, wallet, orders, etc.).
  await deleteWhere('bids', 'bidderId', userId);
  await deleteWhere('bids', 'userId', userId);
  await deleteWhere('reviews', 'userId', userId);
  await deleteWhere('notifications', 'userId', userId);
  await deleteWhere('withdrawals', 'userId', userId);
  await deleteWhere('watchlist', 'userId', userId);
  await deleteWhere('walletTransactions', 'userId', userId);
  await deleteWhere('walletTopups', 'userId', userId);
  await deleteWhere('auctionRegistrations', 'userId', userId);
  await deleteWhere('questions', 'userId', userId);
  await deleteWhere('invitations', 'inviterId', userId);
  await deleteWhere('affiliateCommissions', 'referrerId', userId);
  await deleteWhere('orders', 'buyerId', userId);
  await deleteWhere('orders', 'sellerId', userId);

  // 4) The user doc itself (the watchlist array field, preferences, etc. go with it).
  await userRef.delete();
}

// Product delete with cascade: its bids + decrement the category product count.
async function deleteProductFully(productId) {
  const ref = db.collection('products').doc(productId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const p = snap.data();
  await deleteWhere('bids', 'productId', productId);
  await ref.delete();
  if (p.categoryId) {
    try { await db.collection('categories').doc(p.categoryId).update({ productCount: DEC(-1) }); } catch (_) {}
  }
}

// Order delete with cascade: its payment + shipment records.
async function deleteOrderFully(orderId) {
  await deleteWhere('payments', 'orderId', orderId);
  await deleteWhere('shipments', 'orderId', orderId);
  await db.collection('orders').doc(orderId).delete();
}

// Review delete + recalc the product's average rating / review count.
async function deleteReviewFully(reviewId) {
  const ref = db.collection('reviews').doc(reviewId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const r = snap.data();
  await ref.delete();
  if (r.productId) {
    const rem = await db.collection('reviews').where('productId', '==', r.productId).get();
    let avg = 0;
    if (rem.size > 0) {
      let t = 0;
      rem.docs.forEach((d) => { t += d.data().rating || 0; });
      avg = parseFloat((t / rem.size).toFixed(1));
    }
    try { await db.collection('products').doc(r.productId).update({ averageRating: avg, reviewCount: rem.size }); } catch (_) {}
  }
}

// Category delete — refuse while products still reference it (matches existing guard).
async function deleteCategoryGuarded(categoryId) {
  const used = await db.collection('products').where('categoryId', '==', categoryId).limit(1).get();
  if (!used.empty) throw new Error('Category still has products');
  await db.collection('categories').doc(categoryId).delete();
}

// KYC lives as fields on the user doc — "delete" clears the submission back to NOT_SUBMITTED.
async function clearUserKyc(userId) {
  await db.collection('users').doc(userId).update({
    kycStatus: 'NOT_SUBMITTED',
    kycDocuments: DEL(), kycSubmittedAt: DEL(), kycReviewedAt: DEL(), kycRejectionReason: DEL(),
  });
}

// Seller application lives as a field on the user doc — "delete" clears the application.
async function clearSellerApplication(userId) {
  await db.collection('users').doc(userId).update({ sellerApplication: DEL() });
}

// Affiliate is still a buyer — "delete" REVOKES affiliate status + removes affiliate data (keeps account).
async function revokeAffiliate(userId) {
  await db.collection('users').doc(userId).update({ isAffiliate: false, affiliateActivatedAt: DEL() });
  await deleteWhere('affiliateCommissions', 'referrerId', userId);
  await deleteWhere('invitations', 'inviterId', userId);
}

const simpleDelete = (collection) => (id) => db.collection(collection).doc(id).delete();

// entity key (used by the frontend) -> delete handler
const DELETE_HANDLERS = {
  users: deleteUserFully,
  sellers: deleteUserFully,               // a seller is a user account
  products: deleteProductFully,
  orders: deleteOrderFully,
  transactions: deleteOrderFully,         // AdminPayments "transactions" are order docs
  reviews: deleteReviewFully,
  categories: deleteCategoryGuarded,
  kyc: clearUserKyc,
  'seller-applications': clearSellerApplication,
  affiliates: revokeAffiliate,
  bids: simpleDelete('bids'),
  withdrawals: simpleDelete('withdrawals'),
  payouts: simpleDelete('payouts'),
  payments: simpleDelete('payments'),
  notifications: simpleDelete('notifications'),
  'notification-templates': simpleDelete('notification_templates'),
  shipments: simpleDelete('shipments'),
  questions: simpleDelete('questions'),
};

// Run a hard delete for `entity` over `ids`. Returns { deleted, failed:[{id,reason}] }.
async function runAdminDelete(entity, ids) {
  const handler = DELETE_HANDLERS[entity];
  if (!handler) { const e = new Error(`Unknown entity: ${entity}`); e.status = 400; throw e; }
  let deleted = 0;
  const failed = [];
  for (const id of ids) {
    try { await handler(id); deleted++; }
    catch (e) { failed.push({ id, reason: e.message }); }
  }
  return { deleted, failed };
}

module.exports = { deleteUserFully, runAdminDelete, DELETE_HANDLERS };
