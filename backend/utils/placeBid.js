const { admin, db } = require('../config/firebase');

/**
 * The single place a bid is created.
 *
 * There used to be two: the REST route and the websocket handler. They had
 * already diverged — the socket path wrote `bidsCount` while REST wrote
 * `totalBids`, never marked the previous bid `outbid`, and updated the price
 * outside a transaction so two simultaneous bids could leave `currentPrice`
 * lower than the highest bid. Worst of all it trusted a client-supplied userId,
 * so a user could bid as anyone.
 *
 * Both callers now go through here. Callers are responsible only for
 * authenticating the user and mapping the result to their transport.
 */

const serverTimestamp = () =>
  admin && admin.firestore ? admin.firestore.FieldValue.serverTimestamp() : new Date();

const increment = (value) =>
  admin && admin.firestore ? admin.firestore.FieldValue.increment(value) : value;

/** An error carrying an HTTP status, so REST can map it and sockets can ignore it. */
function bidError(httpStatus, message, payload) {
  const e = new Error(message);
  e.httpStatus = httpStatus;
  if (payload) e.payload = payload;
  return e;
}

function toDate(value) {
  if (!value) return new Date(0);
  if (value._seconds) return new Date(value._seconds * 1000);
  if (typeof value.toDate === 'function') return value.toDate();
  return new Date(value);
}

/**
 * Place a bid.
 *
 * @param {object} args
 * @param {string} args.productId
 * @param {string} args.userId      Authenticated uid — NEVER take this from the client payload.
 * @param {number|string} args.amount
 * @returns {Promise<{bidId, productId, userId, userName, amount, currentPrice, totalBids,
 *                    previousBidderData, product}>}
 */
async function placeBid({ productId, userId, amount }) {
  if (!db) throw bidError(503, 'Database service is temporarily unavailable');
  if (!productId) throw bidError(400, 'Product ID is required');
  if (!userId) throw bidError(401, 'You must be signed in to bid');

  // A non-numeric amount ("abc" -> NaN) would slip through every `NaN < min`
  // comparison, since those are always false. Reject it up front.
  const bidAmount = Number(amount);
  if (!Number.isFinite(bidAmount) || bidAmount <= 0) {
    throw bidError(400, 'A valid bid amount is required');
  }

  const productRef = db.collection('products').doc(productId);
  const bidsCol = db.collection('bids');

  // Cheap pre-checks against a non-transactional read so the common rejections
  // (own item, wrong listing type, unregistered) don't pay for a transaction.
  // Everything race-sensitive is re-checked inside the transaction below.
  const productSnap = await productRef.get();
  if (!productSnap.exists) throw bidError(404, 'Product not found');
  const product = productSnap.data();

  if (product.listingType === 'sale') {
    throw bidError(400, 'Bidding is not available for fixed-price products. Use Buy Now instead.');
  }
  if (product.sellerId === userId) {
    throw bidError(400, 'You cannot bid on your own item');
  }
  if (product.isLiveAuction && !(product.registeredUsers || []).includes(userId)) {
    throw bidError(403, 'You must register and pay the entry fee to bid in this live auction', {
      requiresRegistration: true,
      registrationFee: product.registrationFee || 5,
    });
  }
  if (product.buyNowPrice && bidAmount >= Number(product.buyNowPrice)) {
    throw bidError(400, 'Bid exceeds Buy Now price. Please use Buy Now option instead.');
  }

  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) throw bidError(404, 'User not found');
  const userData = userDoc.data();
  const userName = `${userData.firstName || ''} ${userData.lastName || ''}`.trim()
    || userData.username
    || 'Bidder';

  // Note: users can bid without balance; payment is required only on winning.

  /**
   * All race-sensitive reads and validation happen INSIDE the transaction, on
   * transaction.get() reads. Firestore serializes concurrent transactions
   * touching the same product doc, so a second simultaneous bid re-runs against
   * the first one's committed currentPrice and is rejected if it is no longer
   * high enough. currentPrice therefore cannot regress.
   */
  const result = await db.runTransaction(async (transaction) => {
    // ---- reads (Firestore requires all reads before any write) ----
    const snap = await transaction.get(productRef);
    if (!snap.exists) throw bidError(404, 'Product not found');
    const p = snap.data();

    if (p.status !== 'active') throw bidError(400, 'This auction has ended');
    if (new Date() >= toDate(p.endDate)) throw bidError(400, 'This auction has ended');

    const minBid = Number(p.currentPrice) + Number(p.incrementAmount || 100);
    if (bidAmount < minBid) throw bidError(400, `Minimum bid amount is $${minBid}`);

    // Equality-only queries, so no composite index is needed and they are legal
    // inside a transaction.
    const activeBidsSnap = await transaction.get(
      bidsCol.where('productId', '==', productId).where('status', '==', 'active')
    );
    const userBidsSnap = await transaction.get(
      bidsCol.where('productId', '==', productId).where('userId', '==', userId)
    );

    // ---- writes ----
    // Outbid every currently-active bid (normally exactly one — the standing
    // highest). Doing all of them preserves the invariant that only the newest
    // bid is 'active', even if an earlier bug left extras behind.
    let previousBidderData = null;
    activeBidsSnap.forEach((doc) => {
      const d = doc.data();
      if (!previousBidderData || Number(d.amount) > Number(previousBidderData.amount)) {
        previousBidderData = d;
      }
      transaction.update(doc.ref, { status: 'outbid', updatedAt: serverTimestamp() });
    });

    const bidRef = bidsCol.doc();
    const bidData = {
      productId,
      userId,
      userName,
      amount: bidAmount,
      status: 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    transaction.set(bidRef, bidData);

    const updates = {
      // Validated above against the in-transaction currentPrice, so this can
      // never move the price down.
      currentPrice: bidAmount,
      totalBids: increment(1),
      highestBidderId: userId,
      highestBidderName: userName,
      lastBidAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (userBidsSnap.empty) updates.uniqueBidders = increment(1);
    transaction.update(productRef, updates);

    return {
      bidId: bidRef.id,
      ...bidData,
      // Read back for the caller's broadcast; the stored value is a server
      // timestamp sentinel, which is useless to a client.
      currentPrice: bidAmount,
      totalBids: Number(p.totalBids || 0) + 1,
      previousBidderData,
    };
  });

  return { ...result, product, bidder: userData };
}

module.exports = { placeBid, bidError };
