const express = require('express');
const router = express.Router();
const { admin, db } = require('../config/firebase');
const { authMiddleware } = require('../middleware/auth');
const emailService = require('../services/resendEmailService');
const { checkCityRestriction } = require('../utils/cityRestriction');
const { isShipLogicActive } = require('../utils/shippingSettings');

// Helper functions for Firebase operations
const serverTimestamp = () => {
  return admin && admin.firestore ? admin.firestore.FieldValue.serverTimestamp() : new Date();
};

const increment = (value) => {
  return admin && admin.firestore ? admin.firestore.FieldValue.increment(value) : value;
};

// Place a bid
router.post('/', authMiddleware, async (req, res) => {
  try {
    // Check if Firebase is available
    if (!db) {
      return res.status(503).json({ error: 'Database service is temporarily unavailable' });
    }
    
    const { productId, amount } = req.body;
    const userId = req.user.uid;
    
    // Validate input
    if (!productId || !amount) {
      return res.status(400).json({ error: 'Product ID and amount are required' });
    }

    // A non-numeric amount (e.g. "abc" -> NaN) would otherwise slip through every `NaN < min`
    // comparison (which is always false), so reject it up front.
    const bidAmount = Number(amount);
    if (!Number.isFinite(bidAmount) || bidAmount <= 0) {
      return res.status(400).json({ error: 'A valid bid amount is required' });
    }

    // Get product details
    const productDoc = await db.collection('products').doc(productId).get();
    
    if (!productDoc.exists) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    const product = productDoc.data();

    // Fixed-price products are not auctions — they can't be bid on.
    if (product.listingType === 'sale') {
      return res.status(400).json({ error: 'Bidding is not available for fixed-price products. Use Buy Now instead.' });
    }

    // Check if auction is still active
    if (product.status !== 'active') {
      return res.status(400).json({ error: 'This auction has ended' });
    }
    
    // Check if auction end time has passed
    const now = new Date();
    const endDate = product.endDate?._seconds ? 
      new Date(product.endDate._seconds * 1000) : 
      new Date(product.endDate);
    
    if (now >= endDate) {
      // Update product status
      await productDoc.ref.update({ status: 'ended' });
      return res.status(400).json({ error: 'This auction has ended' });
    }
    
    // Check if user is the seller
    if (product.sellerId === userId) {
      return res.status(400).json({ error: 'You cannot bid on your own item' });
    }

    // Check if live auction registration is required
    if (product.isLiveAuction) {
      const registeredUsers = product.registeredUsers || [];
      if (!registeredUsers.includes(userId)) {
        return res.status(403).json({
          error: 'You must register and pay the entry fee to bid in this live auction',
          requiresRegistration: true,
          registrationFee: product.registrationFee || 5
        });
      }
    }

    // Fast-fail validation against the currently-read price. The AUTHORITATIVE, race-safe version of
    // these checks is re-done inside the transaction below against a transaction.get() read.
    const minimumBid = Number(product.currentPrice) + Number(product.incrementAmount || 100);
    if (bidAmount < minimumBid) {
      return res.status(400).json({
        error: `Minimum bid amount is R${minimumBid}`
      });
    }

    // Check if it exceeds buy now price
    if (product.buyNowPrice && bidAmount >= Number(product.buyNowPrice)) {
      return res.status(400).json({
        error: `Bid exceeds Buy Now price. Please use Buy Now option instead.`
      });
    }
    
    // Get user details
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();

    // City restriction (temporary, until nationwide courier). Only same-city buyers may bid,
    // so an out-of-city user can't win an auction they then can't receive delivery for.
    // Automatically bypassed when ShipLogic (nationwide delivery) is the active courier.
    if (!(await isShipLogicActive())) {
      const cityCheck = checkCityRestriction(product, userData && userData.city);
      if (!cityCheck.allowed) {
        if (cityCheck.reason === 'no-buyer-city') {
          return res.status(403).json({
            error: 'Set your city in your profile to bid on this product',
            requiresCity: true
          });
        }
        return res.status(403).json({
          error: `You can only bid on products available in ${cityCheck.productCity}`,
          cityRestricted: true,
          productCity: cityCheck.productCity
        });
      }
    }

    // Note: users can bid without balance; payment is required only when they win the auction.

    // Place the bid inside a transaction. ALL of the race-sensitive reads and validation (current
    // price, auction status/end time, the standing highest bid) happen INSIDE the transaction against
    // transaction.get() reads. Firestore serializes concurrent transactions on the same product doc,
    // so a second simultaneous bid re-runs against the first one's committed currentPrice and is
    // rejected if it is no longer high enough. This fixes the previous bug where the in-transaction
    // product read was discarded, writes were unconditional, and currentPrice could regress to a
    // lower concurrent bid (leaving two 'active' bids).
    const productRef = db.collection('products').doc(productId);
    const bidsCol = db.collection('bids');
    const bidError = (httpStatus, message, payload) => {
      const e = new Error(message);
      e.httpStatus = httpStatus;
      if (payload) e.payload = payload;
      return e;
    };

    let result;
    try {
      result = await db.runTransaction(async (transaction) => {
        // ---- reads (all reads must precede all writes in a Firestore transaction) ----
        const productSnap = await transaction.get(productRef);
        if (!productSnap.exists) throw bidError(404, 'Product not found');
        const p = productSnap.data();

        // Re-validate the race-sensitive conditions against the in-transaction product.
        if (p.status !== 'active') throw bidError(400, 'This auction has ended');
        const nowTx = new Date();
        const endTx = p.endDate?._seconds ? new Date(p.endDate._seconds * 1000) : new Date(p.endDate);
        if (nowTx >= endTx) throw bidError(400, 'This auction has ended');

        const minBid = Number(p.currentPrice) + Number(p.incrementAmount || 100);
        if (bidAmount < minBid) throw bidError(400, `Minimum bid amount is R${minBid}`);
        if (p.buyNowPrice && bidAmount >= Number(p.buyNowPrice)) {
          throw bidError(400, 'Bid exceeds Buy Now price. Please use Buy Now option instead.');
        }

        // Currently-active bids + this user's prior bids. Both are equality-only queries, so they
        // need no composite index (and work inside a transaction).
        const activeBidsSnap = await transaction.get(
          bidsCol.where('productId', '==', productId).where('status', '==', 'active')
        );
        const userBidsSnap = await transaction.get(
          bidsCol.where('productId', '==', productId).where('userId', '==', userId)
        );

        // ---- writes ----
        // Outbid every currently-active bid (normally exactly one — the standing highest). Doing this
        // for all of them keeps the invariant that only the newest bid is 'active'.
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
          userName: `${userData.firstName} ${userData.lastName}`,
          amount: bidAmount,
          status: 'active',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };
        transaction.set(bidRef, bidData);

        const updates = {
          // Validated above to be >= the in-transaction currentPrice + increment, so this can never
          // regress to a lower value under concurrency.
          currentPrice: bidAmount,
          totalBids: increment(1),
          lastBidAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };
        if (userBidsSnap.empty) {
          updates.uniqueBidders = increment(1);
        }
        transaction.update(productRef, updates);

        return { bidId: bidRef.id, ...bidData, previousBidderData };
      });
    } catch (txErr) {
      // Validation failures thrown inside the transaction carry an httpStatus; map them to responses.
      if (txErr && txErr.httpStatus) {
        return res.status(txErr.httpStatus).json({ error: txErr.message, ...(txErr.payload || {}) });
      }
      throw txErr; // unexpected error -> outer catch -> 500
    }
    
    // Emit socket event for real-time updates
    const io = req.app.get('io');
    if (io) {
      io.to(`auction-${productId}`).emit('new-bid', {
        productId,
        amount,
        userName: result.userName,
        timestamp: new Date()
      });
    }
    
    // Send email notifications
    try {
      // Send bid confirmation to current bidder
      await emailService.sendBidConfirmation(userData, result, product);
      
      // Send outbid notification to previous highest bidder
      if (result.previousBidderData) {
        const previousUserDoc = await db.collection('users').doc(result.previousBidderData.userId).get();
        if (previousUserDoc.exists) {
          const previousUser = previousUserDoc.data();
          await emailService.sendOutbidNotification(previousUser, product, amount);
        }
      }
    } catch (emailError) {
      console.error('Error sending email notifications:', emailError);
      // Don't fail the bid if email fails
    }
    
    res.status(201).json({
      success: true,
      message: 'Bid placed successfully',
      data: result
    });
  } catch (error) {
    console.error('Error placing bid:', error);
    res.status(500).json({ error: 'Failed to place bid' });
  }
});

// Get bids for a product
router.get('/product/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    
    const bidsSnapshot = await db.collection('bids')
      .where('productId', '==', productId)
      .orderBy('amount', 'desc')
      .limit(20)
      .get();
    
    const bids = bidsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    res.json({
      success: true,
      data: bids
    });
  } catch (error) {
    console.error('Error fetching bids:', error);
    res.status(500).json({ error: 'Failed to fetch bids' });
  }
});

// Get user's active bids
router.get('/my-bids', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.uid;
    const status = req.query.status || 'active';
    console.log('Fetching bids for user:', userId, 'with status:', status);
    
    let bidsSnapshot;
    try {
      let query = db.collection('bids')
        .where('userId', '==', userId);
      
      if (status !== 'all') {
        query = query.where('status', '==', status);
      }
      
      bidsSnapshot = await query
        .orderBy('createdAt', 'desc')
        .get();
    } catch (queryError) {
      console.log('Bids query with orderBy failed, trying without:', queryError.message);
      // Fallback without ordering if index is missing
      let query = db.collection('bids')
        .where('userId', '==', userId);
      
      if (status !== 'all') {
        query = query.where('status', '==', status);
      }
      
      bidsSnapshot = await query.get();
    }
    
    const bids = [];
    for (const doc of bidsSnapshot.docs) {
      const bid = { id: doc.id, ...doc.data() };
      
      // Get product details
      const productDoc = await db.collection('products').doc(bid.productId).get();
      if (productDoc.exists) {
        bid.product = {
          id: productDoc.id,
          ...productDoc.data()
        };
      }
      
      bids.push(bid);
    }
    
    res.json({
      success: true,
      data: bids
    });
  } catch (error) {
    console.error('Error fetching user bids:', error);
    res.status(500).json({ error: 'Failed to fetch your bids' });
  }
});

// Check if user is highest bidder
router.get('/highest/:productId', authMiddleware, async (req, res) => {
  try {
    const { productId } = req.params;
    const userId = req.user.uid;
    
    const highestBidSnapshot = await db.collection('bids')
      .where('productId', '==', productId)
      .where('status', '==', 'active')
      .orderBy('amount', 'desc')
      .limit(1)
      .get();
    
    if (highestBidSnapshot.empty) {
      return res.json({
        success: true,
        isHighestBidder: false,
        highestBid: null
      });
    }
    
    const highestBid = highestBidSnapshot.docs[0].data();
    
    res.json({
      success: true,
      isHighestBidder: highestBid.userId === userId,
      highestBid: {
        amount: highestBid.amount,
        userName: highestBid.userName,
        timestamp: highestBid.createdAt
      }
    });
  } catch (error) {
    console.error('Error checking highest bid:', error);
    res.status(500).json({ error: 'Failed to check bid status' });
  }
});

// Cancel/retract a bid (if allowed by rules)
router.delete('/:bidId', authMiddleware, async (req, res) => {
  try {
    const { bidId } = req.params;
    const userId = req.user.uid;

    const bidsCol = db.collection('bids');
    const bidRef = bidsCol.doc(bidId);
    const retractError = (httpStatus, message) => {
      const e = new Error(message);
      e.httpStatus = httpStatus;
      return e;
    };

    // Retract the bid inside a transaction: the ownership/highest-bidder validation and the
    // promotion of the next bid + currentPrice reset must be atomic, otherwise a bid arriving
    // between the "am I still highest?" check and the writes corrupts the price/active-bid state.
    // All reads are equality-only (no composite index) and precede all writes.
    let result;
    try {
      result = await db.runTransaction(async (transaction) => {
        const bidSnap = await transaction.get(bidRef);
        if (!bidSnap.exists) throw retractError(404, 'Bid not found');
        const bid = bidSnap.data();

        if (bid.userId !== userId) throw retractError(403, 'You can only cancel your own bids');
        if (bid.status !== 'active') throw retractError(400, 'Only active bids can be cancelled');

        const productRef = db.collection('products').doc(bid.productId);
        const productSnap = await transaction.get(productRef);
        const activeSnap = await transaction.get(
          bidsCol.where('productId', '==', bid.productId).where('status', '==', 'active')
        );
        const outbidSnap = await transaction.get(
          bidsCol.where('productId', '==', bid.productId).where('status', '==', 'outbid')
        );

        // Can only retract if you are the highest bidder (no OTHER active bid is higher).
        let higherActive = false;
        activeSnap.forEach((d) => {
          if (d.id !== bidId && Number(d.data().amount) > Number(bid.amount)) higherActive = true;
        });
        if (higherActive) throw retractError(400, 'You have been outbid. This bid cannot be cancelled.');

        // Highest previously-outbid bid to promote back to active (computed in memory → no index).
        let nextBid = null;
        outbidSnap.forEach((d) => {
          const data = d.data();
          if (!nextBid || Number(data.amount) > Number(nextBid.amount)) nextBid = { ref: d.ref, amount: data.amount };
        });

        // ---- writes ----
        transaction.update(bidRef, {
          status: 'cancelled',
          cancelledAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        // The cancelled bid no longer counts — decrement in BOTH branches (was previously only
        // decremented when there was no next bid, an inconsistency).
        const productUpdates = { totalBids: increment(-1), updatedAt: serverTimestamp() };
        if (nextBid) {
          transaction.update(nextBid.ref, { status: 'active', updatedAt: serverTimestamp() });
          productUpdates.currentPrice = Number(nextBid.amount);
        } else {
          const product = productSnap.exists ? productSnap.data() : {};
          productUpdates.currentPrice = Number(product.startingPrice) || 0;
        }
        transaction.update(productRef, productUpdates);

        return { promoted: !!nextBid, productId: bid.productId };
      });
    } catch (txErr) {
      if (txErr && txErr.httpStatus) {
        return res.status(txErr.httpStatus).json({ error: txErr.message });
      }
      throw txErr; // unexpected error -> outer catch -> 500
    }

    res.json({
      success: true,
      message: 'Bid cancelled successfully',
      data: result
    });
  } catch (error) {
    console.error('Error cancelling bid:', error);
    res.status(500).json({ error: 'Failed to cancel bid' });
  }
});

module.exports = router;