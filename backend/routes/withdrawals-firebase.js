const express = require('express');
const router = express.Router();
const { admin, db, auth, storage } = require('../config/firebase');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const emailService = require('../services/resendEmailService');

/**
 * A seller has THREE money fields, and they mean different things:
 *
 *   pendingBalance  Sale proceeds not yet earned. Credited when an order is paid,
 *                   moved to `balance` only when that order is delivered (see
 *                   utils/sellerPayout.releaseSellerFundsOnDelivery). NOT
 *                   withdrawable — the buyer could still be refunded.
 *   balance         Spendable. Released proceeds plus wallet top-ups.
 *   heldBalance     Moved out of `balance` while a withdrawal is in flight, so
 *                   the same funds cannot be spent and withdrawn at once.
 *                   Returned to `balance` if the withdrawal is rejected or
 *                   cancelled; simply dropped once it is paid out.
 *
 * Withdrawals therefore draw from `balance` alone. That is deliberate, not an
 * oversight: allowing pendingBalance to be withdrawn would let a seller take the
 * money and then have the order refunded.
 */

// Create withdrawal request
router.post('/request', authMiddleware, async (req, res) => {
  try {
    const { amount, bankDetails, notes } = req.body;
    const userId = req.user.uid;
    
    // Validate input
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid withdrawal amount' });
    }
    
    if (!bankDetails || !bankDetails.accountNumber || !bankDetails.bankName) {
      return res.status(400).json({ error: 'Bank details are required' });
    }
    
    // Get user details
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userData = userDoc.data();
    
    // Check user balance
    if (userData.balance < amount) {
      return res.status(400).json({ 
        error: `Insufficient balance. Available: $${userData.balance}` 
      });
    }
    
    // Check for pending withdrawals
    const pendingWithdrawals = await db.collection('withdrawals')
      .where('userId', '==', userId)
      .where('status', '==', 'pending')
      .get();
    
    console.log(`Found ${pendingWithdrawals.size} pending withdrawals for user ${userId}`);
    
    if (!pendingWithdrawals.empty) {
      // Log details of pending withdrawals for debugging
      const pendingDetails = [];
      pendingWithdrawals.docs.forEach(doc => {
        const data = doc.data();
        console.log(`Pending withdrawal: ${doc.id}, status: ${data.status}, amount: ${data.amount}`);
        pendingDetails.push({
          id: doc.id,
          amount: data.amount,
          requestedAt: data.requestedAt
        });
      });
      
      // Get the first pending withdrawal for the error message
      const firstPending = pendingDetails[0];
      
      return res.status(400).json({ 
        error: `You have a pending withdrawal request of $${firstPending.amount}. Please wait for it to be processed or cancel it first.`,
        pendingWithdrawalId: firstPending.id
      });
    }
    
    // Create withdrawal request
    if (!db) {
      return res.status(500).json({ error: 'Database connection unavailable' });
    }

    const timestamp = admin ? admin.firestore.FieldValue.serverTimestamp() : new Date();
    const withdrawalData = {
      userId,
      userEmail: userData.email,
      userName: `${userData.firstName} ${userData.lastName}`,
      amount,
      bankDetails: {
        accountNumber: bankDetails.accountNumber,
        bankName: bankDetails.bankName,
        accountHolder: bankDetails.accountHolder || userData.firstName + ' ' + userData.lastName,
        branchCode: bankDetails.branchCode || '',
        accountType: bankDetails.accountType || 'Savings'
      },
      notes: notes || '',
      status: 'pending',
      requestedAt: timestamp,
      updatedAt: timestamp
    };

    // Use a transaction to ensure consistency.
    const incrementFn = admin ? admin.firestore.FieldValue.increment : (val) => val;
    try {
      await db.runTransaction(async (transaction) => {
        // Re-read the balance INSIDE the transaction. The check above ran against
        // a stale read; two requests racing past it would each pass and together
        // withdraw more than the seller has, driving `balance` negative.
        const freshUser = await transaction.get(userDoc.ref);
        const freshBalance = Number(freshUser.data().balance || 0);
        if (freshBalance < amount) {
          const e = new Error(`Insufficient balance. Available: $${freshBalance.toFixed(2)}`);
          e.httpStatus = 400;
          throw e;
        }

        const withdrawalRef = db.collection('withdrawals').doc();
        transaction.set(withdrawalRef, withdrawalData);

        // Move the funds out of spendable and into held.
        transaction.update(userDoc.ref, {
          balance: incrementFn(-amount),
          heldBalance: incrementFn(amount),
          updatedAt: timestamp
        });

        withdrawalData.id = withdrawalRef.id;
      });
    } catch (txErr) {
      if (txErr && txErr.httpStatus) {
        return res.status(txErr.httpStatus).json({ error: txErr.message });
      }
      throw txErr;
    }
    
    // Send email notification to user
    try {
      await emailService.sendWithdrawalRequest(userData, withdrawalData);
    } catch (emailError) {
      console.error('Error sending withdrawal request email:', emailError);
    }
    
    res.status(201).json({
      success: true,
      message: 'Withdrawal request submitted successfully',
      data: withdrawalData
    });
  } catch (error) {
    console.error('Error creating withdrawal request:', error);
    res.status(500).json({ error: 'Failed to create withdrawal request' });
  }
});

// Check and cleanup stuck withdrawals (admin only)
router.post('/admin/cleanup-stuck', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    // Find all pending withdrawals for the user
    const pendingWithdrawals = await db.collection('withdrawals')
      .where('userId', '==', userId)
      .where('status', '==', 'pending')
      .get();
    
    const cleaned = [];
    
    for (const doc of pendingWithdrawals.docs) {
      const data = doc.data();
      // Check if it's older than 7 days (stuck)
      const requestedAt = data.requestedAt?.toDate ? data.requestedAt.toDate() : new Date(data.requestedAt);
      const daysSinceRequest = (Date.now() - requestedAt.getTime()) / (1000 * 60 * 60 * 24);
      
      if (daysSinceRequest > 7) {
        // Mark as cancelled and refund
        const timestamp = admin ? admin.firestore.FieldValue.serverTimestamp() : new Date();
        const incrementFn = admin ? admin.firestore.FieldValue.increment : (val) => val;

        await doc.ref.update({
          status: 'cancelled',
          cancelledAt: timestamp,
          adminNotes: 'Auto-cancelled due to being stuck in pending state',
          updatedAt: timestamp
        });

        // Refund the amount
        const userRef = db.collection('users').doc(userId);
        await userRef.update({
          balance: incrementFn(data.amount),
          heldBalance: incrementFn(-data.amount),
          updatedAt: timestamp
        });

        cleaned.push({ id: doc.id, amount: data.amount });
      }
    }
    
    res.json({
      success: true,
      message: `Cleaned up ${cleaned.length} stuck withdrawals`,
      cleaned
    });
  } catch (error) {
    console.error('Error cleaning up stuck withdrawals:', error);
    res.status(500).json({ error: 'Failed to cleanup stuck withdrawals' });
  }
});

// Get user's withdrawal history
router.get('/my-withdrawals', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.uid;
    const { status } = req.query;
    
    let query = db.collection('withdrawals')
      .where('userId', '==', userId);
    
    if (status) {
      query = query.where('status', '==', status);
    }
    
    let snapshot;
    try {
      // Try with orderBy first
      snapshot = await query
        .orderBy('requestedAt', 'desc')
        .get();
    } catch (indexError) {
      console.log('Withdrawals orderBy failed, using fallback:', indexError.message);
      // Fallback without ordering if index is missing
      snapshot = await query.get();
    }
    
    const withdrawals = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    res.json({
      success: true,
      data: withdrawals
    });
  } catch (error) {
    console.error('Error fetching withdrawals:', error);
    res.status(500).json({ error: 'Failed to fetch withdrawal history' });
  }
});

// Admin: Get all withdrawal requests
router.get('/admin/all', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status } = req.query;
    
    let query = db.collection('withdrawals');
    
    if (status) {
      query = query.where('status', '==', status);
    }
    
    let snapshot;
    try {
      // Try with orderBy first
      snapshot = await query
        .orderBy('requestedAt', 'desc')
        .get();
    } catch (indexError) {
      console.log('Admin withdrawals orderBy failed, using fallback:', indexError.message);
      // Fallback without ordering if index is missing
      snapshot = await query.get();
    }
    
    const withdrawals = [];
    for (const doc of snapshot.docs) {
      const withdrawal = { id: doc.id, ...doc.data() };
      
      // Get user details
      const userDoc = await db.collection('users').doc(withdrawal.userId).get();
      if (userDoc.exists) {
        withdrawal.user = userDoc.data();
      }
      
      withdrawals.push(withdrawal);
    }
    
    res.json({
      success: true,
      data: withdrawals
    });
  } catch (error) {
    console.error('Error fetching admin withdrawals:', error);
    res.status(500).json({ error: 'Failed to fetch withdrawals' });
  }
});

// Admin: Approve withdrawal
router.post('/admin/approve/:withdrawalId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { withdrawalId } = req.params;
    const { transactionReference, notes } = req.body;
    const adminId = req.user.uid;
    
    const withdrawalDoc = await db.collection('withdrawals').doc(withdrawalId).get();
    
    if (!withdrawalDoc.exists) {
      return res.status(404).json({ error: 'Withdrawal request not found' });
    }
    
    const withdrawal = withdrawalDoc.data();
    
    if (withdrawal.status !== 'pending') {
      return res.status(400).json({ error: 'This withdrawal has already been processed' });
    }
    
    // Get user details
    const userDoc = await db.collection('users').doc(withdrawal.userId).get();
    const userData = userDoc.data();
    
    // Update withdrawal status
    const timestamp = admin ? admin.firestore.FieldValue.serverTimestamp() : new Date();
    const incrementFn = admin ? admin.firestore.FieldValue.increment : (val) => val;

    await db.runTransaction(async (transaction) => {
      // Update withdrawal
      transaction.update(withdrawalDoc.ref, {
        status: 'approved',
        approvedBy: adminId,
        approvedAt: timestamp,
        transactionReference: transactionReference || '',
        adminNotes: notes || '',
        updatedAt: timestamp
      });

      // Update user's held balance (remove from held since it's approved)
      transaction.update(userDoc.ref, {
        heldBalance: incrementFn(-withdrawal.amount),
        updatedAt: timestamp
      });

      // Create transaction record
      const transactionRef = db.collection('transactions').doc();
      transaction.set(transactionRef, {
        userId: withdrawal.userId,
        type: 'withdrawal',
        amount: -withdrawal.amount,
        status: 'completed',
        description: `Withdrawal to ${withdrawal.bankDetails.bankName} account`,
        reference: transactionReference || '',
        withdrawalId: withdrawalId,
        createdAt: timestamp
      });
    });
    
    // Send email notification
    try {
      await emailService.sendWithdrawalApproved(userData, withdrawal, transactionReference);
    } catch (emailError) {
      console.error('Error sending approval email:', emailError);
    }
    
    res.json({
      success: true,
      message: 'Withdrawal approved successfully'
    });
  } catch (error) {
    console.error('Error approving withdrawal:', error);
    res.status(500).json({ error: 'Failed to approve withdrawal' });
  }
});

// Admin: Reject withdrawal
router.post('/admin/reject/:withdrawalId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { withdrawalId } = req.params;
    const { reason } = req.body;
    const adminId = req.user.uid;
    
    if (!reason) {
      return res.status(400).json({ error: 'Rejection reason is required' });
    }
    
    const withdrawalDoc = await db.collection('withdrawals').doc(withdrawalId).get();
    
    if (!withdrawalDoc.exists) {
      return res.status(404).json({ error: 'Withdrawal request not found' });
    }
    
    const withdrawal = withdrawalDoc.data();
    
    if (withdrawal.status !== 'pending') {
      return res.status(400).json({ error: 'This withdrawal has already been processed' });
    }
    
    // Get user details
    const userDoc = await db.collection('users').doc(withdrawal.userId).get();
    const userData = userDoc.data();
    
    // Update withdrawal status and refund balance
    const timestamp = admin ? admin.firestore.FieldValue.serverTimestamp() : new Date();
    const incrementFn = admin ? admin.firestore.FieldValue.increment : (val) => val;

    await db.runTransaction(async (transaction) => {
      // Update withdrawal
      transaction.update(withdrawalDoc.ref, {
        status: 'rejected',
        rejectedBy: adminId,
        rejectedAt: timestamp,
        rejectionReason: reason,
        updatedAt: timestamp
      });

      // Refund the amount back to user's available balance
      transaction.update(userDoc.ref, {
        balance: incrementFn(withdrawal.amount),
        heldBalance: incrementFn(-withdrawal.amount),
        updatedAt: timestamp
      });
    });
    
    // Send email notification
    try {
      await emailService.sendWithdrawalRejected(userData, withdrawal, reason);
    } catch (emailError) {
      console.error('Error sending rejection email:', emailError);
    }
    
    res.json({
      success: true,
      message: 'Withdrawal rejected successfully'
    });
  } catch (error) {
    console.error('Error rejecting withdrawal:', error);
    res.status(500).json({ error: 'Failed to reject withdrawal' });
  }
});

// Cancel withdrawal request (by user)
router.delete('/:withdrawalId', authMiddleware, async (req, res) => {
  try {
    const { withdrawalId } = req.params;
    const userId = req.user.uid;
    
    const withdrawalDoc = await db.collection('withdrawals').doc(withdrawalId).get();
    
    if (!withdrawalDoc.exists) {
      return res.status(404).json({ error: 'Withdrawal request not found' });
    }
    
    const withdrawal = withdrawalDoc.data();
    
    // Check ownership
    if (withdrawal.userId !== userId) {
      return res.status(403).json({ error: 'You can only cancel your own withdrawal requests' });
    }
    
    // Check status
    if (withdrawal.status !== 'pending') {
      return res.status(400).json({ error: 'Only pending withdrawals can be cancelled' });
    }
    
    console.log(`Cancelling withdrawal ${withdrawalId} with status: ${withdrawal.status}`);
    
    // Cancel and refund
    const timestamp = admin ? admin.firestore.FieldValue.serverTimestamp() : new Date();
    const incrementFn = admin ? admin.firestore.FieldValue.increment : (val) => val;

    await db.runTransaction(async (transaction) => {
      // Update withdrawal
      transaction.update(withdrawalDoc.ref, {
        status: 'cancelled',
        cancelledAt: timestamp,
        updatedAt: timestamp
      });

      // Refund to available balance
      const userRef = db.collection('users').doc(userId);
      transaction.update(userRef, {
        balance: incrementFn(withdrawal.amount),
        heldBalance: incrementFn(-withdrawal.amount),
        updatedAt: timestamp
      });
    });
    
    // Verify the cancellation
    const updatedDoc = await db.collection('withdrawals').doc(withdrawalId).get();
    const updatedData = updatedDoc.data();
    console.log(`Withdrawal ${withdrawalId} cancelled. New status: ${updatedData.status}`);
    
    res.json({
      success: true,
      message: 'Withdrawal request cancelled successfully',
      newStatus: updatedData.status
    });
  } catch (error) {
    console.error('Error cancelling withdrawal:', error);
    res.status(500).json({ error: 'Failed to cancel withdrawal' });
  }
});

module.exports = router;