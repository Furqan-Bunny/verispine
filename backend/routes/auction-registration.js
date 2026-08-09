const express = require('express');
const router = express.Router();
const { admin, db } = require('../config/firebase');
const { authMiddleware } = require('../middleware/auth');

// Default registration fee for live auctions
const DEFAULT_REGISTRATION_FEE = 5; // R5

/**
 * Get user's auction registrations
 * GET /api/auction-registration/my-registrations
 * NOTE: This route MUST come BEFORE /:auctionId routes
 */
router.get('/my-registrations', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.uid;

    const registrationsSnapshot = await db.collection('auctionRegistrations')
      .where('userId', '==', userId)
      .orderBy('registeredAt', 'desc')
      .limit(50)
      .get();

    const registrations = [];

    for (const doc of registrationsSnapshot.docs) {
      const data = doc.data();

      // Get auction details
      const productDoc = await db.collection('products').doc(data.auctionId).get();
      const productData = productDoc.exists ? productDoc.data() : null;

      registrations.push({
        id: doc.id,
        auctionId: data.auctionId,
        auctionTitle: productData?.title || 'Unknown Auction',
        auctionStatus: productData?.status || 'unknown',
        feePaid: data.feePaid,
        status: data.status,
        registeredAt: data.registeredAt?.toDate() || null,
        refundedAt: data.refundedAt?.toDate() || null
      });
    }

    res.json({
      success: true,
      registrations
    });

  } catch (error) {
    console.error('Get my registrations error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get registrations'
    });
  }
});

/**
 * Register for a live auction (pay entry fee)
 * POST /api/auction-registration/:auctionId/register
 */
router.post('/:auctionId/register', authMiddleware, async (req, res) => {
  try {
    const { auctionId } = req.params;
    const userId = req.user.uid;

    console.log('=== LIVE AUCTION REGISTRATION ===');
    console.log('AuctionId:', auctionId);
    console.log('UserId:', userId);

    // Get the auction/product
    const productDoc = await db.collection('products').doc(auctionId).get();

    if (!productDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Auction not found'
      });
    }

    const product = productDoc.data();

    // Check if it's a live auction
    if (!product.isLiveAuction) {
      return res.status(400).json({
        success: false,
        error: 'This is not a live auction. No registration fee required.'
      });
    }

    // Check if auction is still active
    if (product.status !== 'active') {
      return res.status(400).json({
        success: false,
        error: 'This auction is no longer active'
      });
    }

    // Check if user is the seller (can't register for own auction)
    if (product.sellerId === userId) {
      return res.status(400).json({
        success: false,
        error: 'You cannot register for your own auction'
      });
    }

    // Check if already registered
    const existingRegistration = await db.collection('auctionRegistrations')
      .where('auctionId', '==', auctionId)
      .where('userId', '==', userId)
      .where('status', '==', 'active')
      .limit(1)
      .get();

    if (!existingRegistration.empty) {
      return res.status(400).json({
        success: false,
        error: 'You are already registered for this auction'
      });
    }

    // Get registration fee (use product-specific or default)
    const registrationFee = product.registrationFee || DEFAULT_REGISTRATION_FEE;

    // Get user's balance
    const userDoc = await db.collection('users').doc(userId).get();

    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const userData = userDoc.data();
    const currentBalance = userData.balance || 0;

    // Check if user has sufficient balance
    if (currentBalance < registrationFee) {
      return res.status(400).json({
        success: false,
        error: `Insufficient balance. Required: R${registrationFee}, Available: R${currentBalance}`,
        requiredAmount: registrationFee,
        currentBalance: currentBalance
      });
    }

    // Process registration in a transaction
    await db.runTransaction(async (transaction) => {
      // Re-read user balance inside transaction
      const userDocInTx = await transaction.get(userDoc.ref);
      const balanceInTx = userDocInTx.data().balance || 0;

      if (balanceInTx < registrationFee) {
        throw new Error('Insufficient balance');
      }

      // Deduct registration fee from user balance
      transaction.update(userDoc.ref, {
        balance: balanceInTx - registrationFee,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Create registration record
      const registrationRef = db.collection('auctionRegistrations').doc();
      transaction.set(registrationRef, {
        id: registrationRef.id,
        auctionId: auctionId,
        userId: userId,
        userEmail: userData.email || '',
        userName: `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || userData.username || 'User',
        feePaid: registrationFee,
        status: 'active',
        registeredAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Create transaction record
      const transactionRef = db.collection('transactions').doc();
      transaction.set(transactionRef, {
        id: transactionRef.id,
        userId: userId,
        type: 'auction_registration',
        amount: -registrationFee,
        status: 'completed',
        description: `Live auction registration fee: ${product.title}`,
        auctionId: auctionId,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Update product's registered users array
      const currentRegistered = product.registeredUsers || [];
      if (!currentRegistered.includes(userId)) {
        transaction.update(productDoc.ref, {
          registeredUsers: [...currentRegistered, userId],
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    });

    console.log('Registration successful!');
    console.log('=== REGISTRATION COMPLETE ===');

    res.json({
      success: true,
      message: `Successfully registered for auction. R${registrationFee} has been deducted from your wallet.`,
      data: {
        auctionId,
        feePaid: registrationFee,
        newBalance: currentBalance - registrationFee
      }
    });

  } catch (error) {
    console.error('Auction registration error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to register for auction'
    });
  }
});

/**
 * Check if user is registered for an auction
 * GET /api/auction-registration/:auctionId/check
 */
router.get('/:auctionId/check', authMiddleware, async (req, res) => {
  try {
    const { auctionId } = req.params;
    const userId = req.user.uid;

    // Get the auction/product
    const productDoc = await db.collection('products').doc(auctionId).get();

    if (!productDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Auction not found'
      });
    }

    const product = productDoc.data();

    // If not a live auction, no registration needed
    if (!product.isLiveAuction) {
      return res.json({
        success: true,
        isLiveAuction: false,
        isRegistered: true, // Not needed, so consider registered
        registrationRequired: false
      });
    }

    // Check registration
    const registrationSnapshot = await db.collection('auctionRegistrations')
      .where('auctionId', '==', auctionId)
      .where('userId', '==', userId)
      .where('status', '==', 'active')
      .limit(1)
      .get();

    const isRegistered = !registrationSnapshot.empty;
    const registrationFee = product.registrationFee || DEFAULT_REGISTRATION_FEE;

    res.json({
      success: true,
      isLiveAuction: true,
      isRegistered: isRegistered,
      registrationRequired: true,
      registrationFee: registrationFee,
      auctionTitle: product.title
    });

  } catch (error) {
    console.error('Check registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check registration status'
    });
  }
});

/**
 * Get all registered users for an auction (Admin only)
 * GET /api/auction-registration/:auctionId/users
 */
router.get('/:auctionId/users', authMiddleware, async (req, res) => {
  try {
    const { auctionId } = req.params;

    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    const registrationsSnapshot = await db.collection('auctionRegistrations')
      .where('auctionId', '==', auctionId)
      .where('status', '==', 'active')
      .orderBy('registeredAt', 'desc')
      .get();

    const registrations = [];
    registrationsSnapshot.forEach(doc => {
      const data = doc.data();
      registrations.push({
        id: doc.id,
        userId: data.userId,
        userName: data.userName,
        userEmail: data.userEmail,
        feePaid: data.feePaid,
        registeredAt: data.registeredAt?.toDate() || null
      });
    });

    res.json({
      success: true,
      data: {
        auctionId,
        totalRegistered: registrations.length,
        registrations
      }
    });

  } catch (error) {
    console.error('Get registered users error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get registered users'
    });
  }
});

/**
 * Refund registration fee (Admin only - for cancelled auctions)
 * POST /api/auction-registration/:auctionId/refund
 */
router.post('/:auctionId/refund', authMiddleware, async (req, res) => {
  try {
    const { auctionId } = req.params;

    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    // Get all active registrations for this auction
    const registrationsSnapshot = await db.collection('auctionRegistrations')
      .where('auctionId', '==', auctionId)
      .where('status', '==', 'active')
      .get();

    if (registrationsSnapshot.empty) {
      return res.json({
        success: true,
        message: 'No registrations to refund',
        refundedCount: 0
      });
    }

    let refundedCount = 0;

    // Process refunds
    const batch = db.batch();

    for (const doc of registrationsSnapshot.docs) {
      const registration = doc.data();
      const userRef = db.collection('users').doc(registration.userId);

      // Update user balance
      batch.update(userRef, {
        balance: admin.firestore.FieldValue.increment(registration.feePaid),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Update registration status
      batch.update(doc.ref, {
        status: 'refunded',
        refundedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Create refund transaction record
      const transactionRef = db.collection('transactions').doc();
      batch.set(transactionRef, {
        id: transactionRef.id,
        userId: registration.userId,
        type: 'auction_registration_refund',
        amount: registration.feePaid,
        status: 'completed',
        description: `Live auction registration refund (auction cancelled)`,
        auctionId: auctionId,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      refundedCount++;
    }

    await batch.commit();

    res.json({
      success: true,
      message: `Refunded ${refundedCount} registrations`,
      refundedCount
    });

  } catch (error) {
    console.error('Refund error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process refunds'
    });
  }
});

module.exports = router;
