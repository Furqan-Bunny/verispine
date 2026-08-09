const express = require('express');
const router = express.Router();
const { admin, db, auth: firebaseAuth, storage } = require('../config/firebase');
const { authMiddleware: auth } = require('../middleware/auth');
const crypto = require('crypto');
const emailService = require('../services/resendEmailService');
const {
  computeAffiliateSummary,
  computeReferralAggregates,
  isPaidOrder
} = require('../utils/affiliateCommission');

// Mask an email for display to a referrer (privacy): jane@gmail.com -> j***@gmail.com
const maskEmail = (email) => {
  if (!email || typeof email !== 'string' || !email.includes('@')) return 'Hidden';
  const [local, domain] = email.split('@');
  const head = local.slice(0, 1);
  return `${head}${'*'.repeat(Math.max(2, local.length - 1))}@${domain}`;
};

const toDateOrNull = (v) => {
  if (!v) return null;
  if (v.toDate) return v.toDate();
  if (v._seconds) return new Date(v._seconds * 1000);
  if (v instanceof Date) return v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

// Middleware: require user to be an active affiliate
const requireAffiliate = async (req, res, next) => {
  try {
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    if (!userDoc.exists || !userDoc.data().isAffiliate) {
      return res.status(403).json({ error: 'Affiliate program not activated. Please activate your affiliate account first.' });
    }
    next();
  } catch (error) {
    console.error('Error checking affiliate status:', error);
    res.status(500).json({ error: 'Failed to verify affiliate status' });
  }
};

// Generate unique referral code
const generateReferralCode = () => {
  return crypto.randomBytes(8).toString('hex');
};

// Shared function to process referral tracking (no signup bonus - only tracks referredBy for purchase commission)
const processReferralReward = async (referralCode, newUserId, newUserEmail) => {
  console.log('========== PROCESS REFERRAL START ==========');
  console.log('Input params:', { referralCode, newUserId, newUserEmail });

  if (!referralCode || !newUserId) {
    console.log('ERROR: Missing required fields');
    throw new Error('Missing required fields');
  }

  // First, try to find an invitation with this referral code
  console.log('Searching for invitation with referralCode:', referralCode);
  const invitationSnapshot = await db.collection('invitations')
    .where('referralCode', '==', referralCode)
    .where('status', '==', 'pending')
    .limit(1)
    .get();

  console.log('Invitation search result - empty:', invitationSnapshot.empty, 'size:', invitationSnapshot.size);

  if (!invitationSnapshot.empty) {
    // Process invitation-based referral
    const invitationDoc = invitationSnapshot.docs[0];
    const invitation = invitationDoc.data();
    console.log('Found invitation:', { id: invitationDoc.id, inviterId: invitation.inviterId, inviteeEmail: invitation.inviteeEmail });

    // Check if expired
    if (invitation.expiresAt && invitation.expiresAt.toDate() < new Date()) {
      console.log('ERROR: Invitation has expired');
      throw new Error('Invitation has expired');
    }

    // Start transaction - only track referral, no signup bonus
    console.log('Starting Firestore transaction to update invitation...');
    try {
      await db.runTransaction(async (transaction) => {
        console.log('Inside transaction - doing ALL READS first...');

        // ===== ALL READS FIRST =====
        const inviterRef = db.collection('users').doc(invitation.inviterId);
        const newUserRef = db.collection('users').doc(newUserId);

        const inviterDoc = await transaction.get(inviterRef);
        const newUserDoc = await transaction.get(newUserRef);

        console.log('Inviter doc exists:', inviterDoc.exists);
        console.log('New user doc exists:', newUserDoc.exists);

        // ===== ALL WRITES AFTER READS =====
        console.log('Now doing ALL WRITES...');

        // 1. Update invitation status
        transaction.update(invitationDoc.ref, {
          status: 'completed',
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
          inviteeId: newUserId
        });
        console.log('Invitation status updated to completed');

        // 2. Update inviter's totalReferrals count (no balance credit)
        if (inviterDoc.exists) {
          transaction.update(inviterRef, {
            totalReferrals: (inviterDoc.data().totalReferrals || 0) + 1
          });
          console.log('Inviter totalReferrals updated');
        }

        // 3. Track referral for new user (for purchase commission)
        if (newUserDoc.exists) {
          console.log('Updating new user with referredBy:', invitation.inviterId);
          transaction.update(newUserRef, {
            referredBy: invitation.inviterId,
            referralCode: referralCode
          });
        } else {
          console.log('New user doc does not exist, skipping referredBy update');
        }
      });
      console.log('Transaction completed successfully!');
    } catch (txError) {
      console.error('Transaction FAILED:', txError);
      throw txError;
    }

    console.log('========== PROCESS REFERRAL SUCCESS (invitation) ==========');
    return { success: true, type: 'invitation', message: 'Referral tracked successfully' };
  }

  // If not an invitation code, check if it's a user UID (direct referral link)
  console.log('No invitation found, checking if referralCode is a user UID...');
  const inviterDoc = await db.collection('users').doc(referralCode).get();
  console.log('User UID check - exists:', inviterDoc.exists);

  if (inviterDoc.exists) {
    const inviterData = inviterDoc.data();
    console.log('Processing as DIRECT referral for user:', inviterData.email);

    // Process direct referral - only track referral, no signup bonus
    await db.runTransaction(async (transaction) => {
      // ===== ALL READS FIRST =====
      const inviterRef = db.collection('users').doc(referralCode);
      const newUserRef = db.collection('users').doc(newUserId);

      const inviterDocTx = await transaction.get(inviterRef);
      const newUserDoc = await transaction.get(newUserRef);

      console.log('Direct referral - inviter exists:', inviterDocTx.exists);
      console.log('Direct referral - new user exists:', newUserDoc.exists);

      // ===== ALL WRITES AFTER READS =====
      // Update inviter's totalReferrals count (no balance credit)
      if (inviterDocTx.exists) {
        transaction.update(inviterRef, {
          totalReferrals: (inviterDocTx.data().totalReferrals || 0) + 1
        });
        console.log('Direct referral - totalReferrals updated');
      }

      // Track referral for new user (for purchase commission)
      if (newUserDoc.exists) {
        transaction.update(newUserRef, {
          referredBy: referralCode
        });
      }
    });
    console.log('Direct referral transaction completed!');

    console.log('========== PROCESS REFERRAL SUCCESS (direct) ==========');
    return { success: true, type: 'direct', message: 'Referral tracked successfully' };
  }

  // Neither invitation code nor user UID found
  console.log('========== PROCESS REFERRAL FAILED - Invalid code ==========');
  throw new Error('Invalid referral code');
};

// Get affiliate status for current user
router.get('/status', auth, async (req, res) => {
  try {
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }
    const userData = userDoc.data();
    res.json({
      isAffiliate: userData.isAffiliate || false,
      kycStatus: userData.kycStatus || 'NOT_SUBMITTED'
    });
  } catch (error) {
    console.error('Error fetching affiliate status:', error);
    res.status(500).json({ error: 'Failed to fetch affiliate status' });
  }
});

// Activate affiliate program for current user (requires KYC approval)
router.post('/activate', auth, async (req, res) => {
  try {
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }
    const userData = userDoc.data();

    if (userData.isAffiliate) {
      return res.json({ message: 'Affiliate program already activated', isAffiliate: true });
    }

    if (userData.kycStatus !== 'APPROVED') {
      return res.status(400).json({ error: 'KYC verification must be approved before activating the affiliate program.' });
    }

    await db.collection('users').doc(req.user.uid).update({
      isAffiliate: true,
      affiliateActivatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ message: 'Affiliate program activated successfully!', isAffiliate: true });
  } catch (error) {
    console.error('Error activating affiliate:', error);
    res.status(500).json({ error: 'Failed to activate affiliate program' });
  }
});

// Send invitation email
router.post('/invite', auth, requireAffiliate, async (req, res) => {
  try {
    const { email, name } = req.body;
    const inviterId = req.user.uid;
    
    console.log('Invite request:', { email, name, inviterId, userEmail: req.user.email });

    // Check if email is already registered
    if (!firebaseAuth) {
      return res.status(500).json({ error: 'Firebase Auth not initialized' });
    }

    const existingUser = await firebaseAuth.getUserByEmail(email).catch((error) => {
      console.log('User lookup error (expected if not exists):', error.code);
      return null;
    });
    if (existingUser) {
      console.log('User already exists:', email);
      return res.status(400).json({ error: 'User already exists' });
    }

    // Check if invitation already sent
    const existingInvite = await db.collection('invitations')
      .where('inviterEmail', '==', req.user.email)
      .where('inviteeEmail', '==', email)
      .where('status', '==', 'pending')
      .get();

    if (!existingInvite.empty) {
      console.log('Invitation already sent to:', email);
      return res.status(400).json({ error: 'Invitation already sent to this email' });
    }

    // Generate referral code
    const referralCode = generateReferralCode();

    // Create invitation record
    if (!db) {
      return res.status(500).json({ error: 'Database connection unavailable' });
    }

    const timestamp = admin ? admin.firestore.FieldValue.serverTimestamp() : new Date();
    const invitation = {
      inviterId,
      inviterEmail: req.user.email,
      inviterName: req.user.displayName || req.user.email,
      inviteeEmail: email,
      inviteeName: name || '',
      referralCode,
      status: 'pending',
      createdAt: timestamp,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    };

    await db.collection('invitations').add(invitation);

    // Send invitation email using Resend
    const inviteLink = `${process.env.FRONTEND_URL}/register?ref=${referralCode}`;
    console.log('Frontend URL:', process.env.FRONTEND_URL);
    console.log('Invite link:', inviteLink);

    await emailService.sendInvitationEmail({
      email,
      name: name || email,
      inviterName: invitation.inviterName,
      inviteLink
    });

    res.json({ message: 'Invitation sent successfully' });
  } catch (error) {
    console.error('Error sending invitation:', error);
    res.status(500).json({ error: 'Failed to send invitation' });
  }
});

// Get user's invitations
router.get('/invitations', auth, requireAffiliate, async (req, res) => {
  try {
    // First get all invitations for the user without ordering
    const invitations = await db.collection('invitations')
      .where('inviterId', '==', req.user.uid)
      .get();

    const invitationList = [];
    invitations.forEach(doc => {
      const data = doc.data();
      invitationList.push({
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate() || new Date(),
        expiresAt: data.expiresAt?.toDate ? data.expiresAt.toDate() : data.expiresAt
      });
    });

    // Sort in memory instead of using Firestore orderBy
    invitationList.sort((a, b) => b.createdAt - a.createdAt);

    res.json(invitationList);
  } catch (error) {
    console.error('Error fetching invitations:', error);
    res.status(500).json({ error: 'Failed to fetch invitations' });
  }
});

// Validate referral code (supports both invitation codes and user UIDs)
router.get('/validate/:code', async (req, res) => {
  try {
    const { code } = req.params;

    // First, check if it's a referral code from an invitation
    const invitationSnapshot = await db.collection('invitations')
      .where('referralCode', '==', code)
      .where('status', '==', 'pending')
      .limit(1)
      .get();

    if (!invitationSnapshot.empty) {
      const invitation = invitationSnapshot.docs[0].data();

      // Check if expired
      if (invitation.expiresAt && invitation.expiresAt.toDate() < new Date()) {
        return res.status(400).json({ valid: false, error: 'Invitation has expired' });
      }

      return res.json({
        valid: true,
        inviterName: invitation.inviterName,
        inviterEmail: maskEmail(invitation.inviterEmail),
        inviteeEmail: invitation.inviteeEmail, // Return invitee email for pre-fill
        inviteeName: invitation.inviteeName,
        type: 'invitation'
      });
    }

    // If not found in invitations, check if it's a valid user UID (for copy link referrals)
    const userDoc = await db.collection('users').doc(code).get();

    if (userDoc.exists) {
      const userData = userDoc.data();
      return res.json({
        valid: true,
        inviterName: userData.firstName ? `${userData.firstName} ${userData.lastName || ''}`.trim() : userData.displayName || 'A Quicksell User',
        inviterEmail: maskEmail(userData.email),
        type: 'direct'
      });
    }

    // Neither invitation code nor user UID found
    return res.status(404).json({ valid: false, error: 'Invalid referral code' });
  } catch (error) {
    console.error('Error validating referral:', error);
    res.status(500).json({ error: 'Failed to validate referral code' });
  }
});

// Process referral on signup (uses shared function - supports both invitation codes and user UIDs)
router.post('/process-referral', auth, async (req, res) => {
  try {
    const { referralCode, newUserEmail } = req.body;
    // SECURITY: the new user is the authenticated caller — never trust a client-supplied
    // user id (that allowed assigning arbitrary referrals).
    const newUserId = req.user.uid;

    const result = await processReferralReward(referralCode, newUserId, newUserEmail);
    return res.json(result);
  } catch (error) {
    console.error('Error processing referral:', error);

    if (error.message === 'Missing required fields') {
      return res.status(400).json({ error: error.message });
    }
    if (error.message === 'Invitation has expired') {
      return res.status(400).json({ error: error.message });
    }
    if (error.message === 'Invalid referral code') {
      return res.status(404).json({ error: error.message });
    }

    res.status(500).json({ error: 'Failed to process referral' });
  }
});

// Admin: Manually complete a pending invitation by invitee email
router.post('/admin/complete-invitation', auth, async (req, res) => {
  try {
    const { inviteeEmail } = req.body;
    const userId = req.user.uid;

    // Check if user is admin
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || userDoc.data().role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    if (!inviteeEmail) {
      return res.status(400).json({ error: 'Invitee email is required' });
    }

    // Find the pending invitation
    const invitationSnapshot = await db.collection('invitations')
      .where('inviteeEmail', '==', inviteeEmail)
      .where('status', '==', 'pending')
      .limit(1)
      .get();

    if (invitationSnapshot.empty) {
      return res.status(404).json({ error: 'No pending invitation found for this email' });
    }

    const invitationDoc = invitationSnapshot.docs[0];
    const invitation = invitationDoc.data();

    // Find the invitee user (who registered with this email)
    const inviteeSnapshot = await db.collection('users')
      .where('email', '==', inviteeEmail)
      .limit(1)
      .get();

    if (inviteeSnapshot.empty) {
      return res.status(404).json({ error: 'User with this email has not registered yet' });
    }

    const inviteeId = inviteeSnapshot.docs[0].id;

    // Process the referral - only track, no signup bonus
    await db.runTransaction(async (transaction) => {
      // Update invitation status
      transaction.update(invitationDoc.ref, {
        status: 'completed',
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        inviteeId: inviteeId,
        completedBy: 'admin'
      });

      // Update inviter's totalReferrals count (no balance credit)
      const inviterRef = db.collection('users').doc(invitation.inviterId);
      const inviterDoc = await transaction.get(inviterRef);

      if (inviterDoc.exists) {
        transaction.update(inviterRef, {
          totalReferrals: (inviterDoc.data().totalReferrals || 0) + 1
        });
      }

      // Track referral for invitee (for purchase commission)
      const inviteeRef = db.collection('users').doc(inviteeId);
      transaction.update(inviteeRef, {
        referredBy: invitation.inviterId
      });
    });

    res.json({
      success: true,
      message: `Invitation completed! Referral tracked for ${invitation.inviterName}. They will earn 5% commission on purchases.`
    });
  } catch (error) {
    console.error('Error completing invitation:', error);
    res.status(500).json({ error: 'Failed to complete invitation' });
  }
});

// Get referral statistics
router.get('/stats', auth, requireAffiliate, async (req, res) => {
  try {
    const userId = req.user.uid;

    // Get all invitations
    const invitations = await db.collection('invitations')
      .where('inviterId', '==', userId)
      .get();

    let pending = 0;
    let completed = 0;

    invitations.forEach(doc => {
      const data = doc.data();
      if (data.status === 'pending') {
        // Check if expired
        const expiresAt = data.expiresAt?.toDate ? data.expiresAt.toDate() : data.expiresAt;
        if (expiresAt && new Date(expiresAt) < new Date()) {
          // Expired, don't count as pending
        } else {
          pending++;
        }
      } else if (data.status === 'completed') {
        completed++;
      }
    });

    // Commission earnings (released vs pending) + downstream referral activity,
    // via the shared helpers so this matches the admin view exactly.
    const summary = await computeAffiliateSummary(userId);
    const refAgg = await computeReferralAggregates(userId);

    res.json({
      totalInvitations: invitations.size,
      pending,
      completed,
      totalEarned: summary.totalEarned,                 // released (withdrawable) commission
      pendingCommission: summary.pendingCommission,     // held until the referred order is delivered
      owedFromReversals: summary.owedFromReversals,     // debt from refund clawbacks (settled on next release)
      referredUsersCount: refAgg.referredUsersCount,    // people who signed up under this affiliate (invite + direct)
      referralPurchases: refAgg.referralPurchases       // paid orders made by those users
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Get the current affiliate's referred users + their activity (privacy-masked)
router.get('/referrals', auth, requireAffiliate, async (req, res) => {
  try {
    const userId = req.user.uid;

    const usersSnap = await db.collection('users').where('referredBy', '==', userId).get();
    const referred = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const referredIds = referred.map(u => u.id);

    // Commission generated per referred user (credited + pending), one query.
    const commissionByUser = {};
    try {
      const commSnap = await db.collection('affiliateCommissions').where('referrerId', '==', userId).get();
      commSnap.forEach(doc => {
        const c = doc.data();
        if (c.status === 'reversed') return;
        commissionByUser[c.referredUserId] = (commissionByUser[c.referredUserId] || 0) + Number(c.commissionAmount || 0);
      });
    } catch (e) { console.error('referrals: commission fetch failed', e); }

    // Paid orders per referred user (chunked `in` query).
    const purchasesByUser = {};
    const spentByUser = {};
    for (let i = 0; i < referredIds.length; i += 30) {
      const chunk = referredIds.slice(i, i + 30);
      if (!chunk.length) break;
      const ordersSnap = await db.collection('orders').where('buyerId', 'in', chunk).get();
      ordersSnap.forEach(doc => {
        const o = doc.data();
        if (!isPaidOrder(o)) return;
        purchasesByUser[o.buyerId] = (purchasesByUser[o.buyerId] || 0) + 1;
        spentByUser[o.buyerId] = (spentByUser[o.buyerId] || 0) + (parseFloat(o.amount) || 0);
      });
    }

    const rows = referred.map(u => ({
      name: u.firstName || maskEmail(u.email),
      signupDate: toDateOrNull(u.createdAt),
      // invitation signups carry a referralCode; direct copy-link signups do not
      type: u.referralCode ? 'invite' : 'direct',
      purchaseCount: purchasesByUser[u.id] || 0,
      totalSpent: spentByUser[u.id] || 0,
      commissionGenerated: commissionByUser[u.id] || 0
    }));

    rows.sort((a, b) => b.commissionGenerated - a.commissionGenerated);

    res.json(rows);
  } catch (error) {
    console.error('Error fetching referrals:', error);
    res.status(500).json({ error: 'Failed to fetch referrals' });
  }
});

module.exports = router;
module.exports.processReferralReward = processReferralReward;