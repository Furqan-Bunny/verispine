const express = require('express');
const router = express.Router();
const { admin, db } = require('../config/firebase');
const { authMiddleware } = require('../middleware/auth');
const emailService = require('../services/resendEmailService');
const { placeBid } = require('../utils/placeBid');

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
    const { productId, amount } = req.body;

    // userId comes from the verified token, never from the body.
    const result = await placeBid({ productId, amount, userId: req.user.uid });

    // Broadcast to everyone watching this auction. The socket service is
    // registered on the app as 'socketService' — the previous code asked for
    // 'io', got undefined, and silently skipped every REST-placed bid, so live
    // viewers only ever saw bids placed through the websocket.
    try {
      const socketService = req.app.get('socketService');
      if (socketService && socketService.io) {
        socketService.io.to(`auction-${productId}`).emit('new-bid', {
          id: result.bidId,
          productId,
          userId: result.userId,
          userName: result.userName,
          amount: result.amount,
          currentPrice: result.currentPrice,
          totalBids: result.totalBids,
          timestamp: new Date(),
        });
      }
    } catch (e) {
      console.error('Bid broadcast failed:', e.message);
    }

    // Emails are best-effort; a mail failure must not undo a placed bid.
    try {
      await emailService.sendBidConfirmation(result.bidder, result, result.product);

      if (result.previousBidderData) {
        const previousUserDoc = await db.collection('users').doc(result.previousBidderData.userId).get();
        if (previousUserDoc.exists) {
          await emailService.sendOutbidNotification(previousUserDoc.data(), result.product, result.amount);
        }
      }
    } catch (emailError) {
      console.error('Error sending bid email notifications:', emailError.message);
    }

    res.status(201).json({
      success: true,
      message: 'Bid placed successfully',
      data: {
        bidId: result.bidId,
        productId,
        amount: result.amount,
        userName: result.userName,
        currentPrice: result.currentPrice,
        totalBids: result.totalBids,
      }
    });
  } catch (error) {
    if (error && error.httpStatus) {
      return res.status(error.httpStatus).json({ error: error.message, ...(error.payload || {}) });
    }
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