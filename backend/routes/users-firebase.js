const express = require('express');
const router = express.Router();
const { admin, db, auth, storage } = require('../config/firebase');
const { authMiddleware } = require('../middleware/auth');

// Get user profile
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userData = userDoc.data();
    delete userData.password; // Never send password
    
    res.json({
      success: true,
      data: userData
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Get user dashboard stats
router.get('/dashboard', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.uid;
    console.log('Fetching dashboard for user:', userId);
    
    // Get user data
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      console.log('User not found in Firestore:', userId);
      return res.status(404).json({ error: 'User not found' });
    }
    const userData = userDoc.data();
    
    // Get user's active bids
    const activeBidsSnapshot = await db.collection('bids')
      .where('userId', '==', userId)
      .where('status', '==', 'active')
      .get();
    
    // Get user's won auctions
    const wonAuctionsSnapshot = await db.collection('products')
      .where('winnerId', '==', userId)
      .where('status', '==', 'sold')
      .get();
    
    // Get user's orders - handle potential missing index
    let ordersSnapshot;
    try {
      ordersSnapshot = await db.collection('orders')
        .where('buyerId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(5)
        .get();
    } catch (orderError) {
      console.log('Order query failed, trying without orderBy:', orderError.message);
      // Fallback without ordering if index is missing
      ordersSnapshot = await db.collection('orders')
        .where('buyerId', '==', userId)
        .limit(5)
        .get();
    }
    
    // Get user's watchlist
    const watchlistSnapshot = await db.collection('watchlist')
      .where('userId', '==', userId)
      .get();
    
    // Process recent activity
    const recentActivity = [];
    
    // Add recent bids to activity - handle potential missing index
    let recentBidsSnapshot;
    try {
      recentBidsSnapshot = await db.collection('bids')
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(10)
        .get();
    } catch (bidError) {
      console.log('Bids query failed, trying without orderBy:', bidError.message);
      // Fallback without ordering if index is missing
      recentBidsSnapshot = await db.collection('bids')
        .where('userId', '==', userId)
        .limit(10)
        .get();
    }
    
    for (const doc of recentBidsSnapshot.docs) {
      const bid = doc.data();
      const productDoc = await db.collection('products').doc(bid.productId).get();
      if (productDoc.exists) {
        recentActivity.push({
          id: doc.id,
          type: 'bid',
          description: `Placed bid on ${productDoc.data().title}`,
          amount: bid.amount,
          timestamp: bid.createdAt,
          status: bid.status
        });
      }
    }
    
    // Sort activity by timestamp
    recentActivity.sort((a, b) => {
      const timeA = a.timestamp?._seconds || 0;
      const timeB = b.timestamp?._seconds || 0;
      return timeB - timeA;
    });
    
    // Calculate stats
    const stats = {
      totalBids: activeBidsSnapshot.size,
      wonAuctions: wonAuctionsSnapshot.size,
      totalSpent: userData.totalSpent || 0,
      watchlistCount: watchlistSnapshot.size,
      balance: userData.balance || 0,
      pendingOrders: ordersSnapshot.docs.filter(doc => 
        doc.data().status === 'pending' || doc.data().status === 'processing'
      ).length
    };
    
    // Get recent products for recommendations - handle potential missing index
    let recommendedProducts;
    try {
      recommendedProducts = await db.collection('products')
        .where('status', '==', 'active')
        .orderBy('views', 'desc')
        .limit(4)
        .get();
    } catch (productError) {
      console.log('Products query failed, trying without orderBy:', productError.message);
      // Fallback without ordering if index is missing
      recommendedProducts = await db.collection('products')
        .where('status', '==', 'active')
        .limit(4)
        .get();
    }
    
    const recommendations = recommendedProducts.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    res.json({
      success: true,
      data: {
        user: {
          firstName: userData.firstName,
          lastName: userData.lastName,
          email: userData.email,
          avatar: userData.avatar,
          memberSince: userData.createdAt
        },
        stats,
        recentActivity: recentActivity.slice(0, 5),
        recommendations
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

// Slug helpers (used by seller profile updates)
function slugifyName(input) {
  return String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 40);
}

async function isSlugTaken(slug, exceptUserId) {
  const snapshot = await db.collection('users')
    .where('sellerProfile.slug', '==', slug)
    .limit(2)
    .get();
  return snapshot.docs.some(d => d.id !== exceptUserId);
}

// Update user profile
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const updates = {};
    const allowedFields = ['firstName', 'lastName', 'phone', 'address', 'bio',
      'city', 'province', 'postalCode', 'country', 'businessName',
      'bankDetails', 'notificationPreferences'];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    // Allow sellers/admins to update sellerProfile fields (excluding sensitive admin-only)
    if (req.body.sellerProfile && (req.user.role === 'seller' || req.user.role === 'admin')) {
      const userRef = db.collection('users').doc(req.user.uid);
      const userDoc = await userRef.get();
      const existing = userDoc.data()?.sellerProfile || {};

      const sp = req.body.sellerProfile;
      const cleanSp = {};

      if (sp.businessName !== undefined) {
        const trimmed = String(sp.businessName).trim();
        if (trimmed.length < 2 || trimmed.length > 60) {
          return res.status(400).json({ error: 'businessName must be 2-60 characters' });
        }
        cleanSp.businessName = trimmed;
      }
      if (sp.slug !== undefined) {
        const newSlug = slugifyName(sp.slug);
        if (newSlug.length < 2) {
          return res.status(400).json({ error: 'slug must be at least 2 characters' });
        }
        if (newSlug !== existing.slug) {
          const taken = await isSlugTaken(newSlug, req.user.uid);
          if (taken) {
            return res.status(409).json({ error: 'This storefront URL is taken. Try another.' });
          }
        }
        cleanSp.slug = newSlug;
      }
      if (sp.description !== undefined) cleanSp.description = String(sp.description).slice(0, 500);
      if (sp.contactEmail !== undefined) cleanSp.contactEmail = String(sp.contactEmail).trim();
      if (sp.returnPolicy !== undefined) cleanSp.returnPolicy = String(sp.returnPolicy).slice(0, 1000);
      if (sp.shippingPolicy !== undefined) cleanSp.shippingPolicy = String(sp.shippingPolicy).slice(0, 1000);
      // verifiedSeller and aggregates are admin-only / system-managed — skip silently

      // Build dotted-path updates so we don't clobber other sellerProfile fields
      for (const k of Object.keys(cleanSp)) {
        updates[`sellerProfile.${k}`] = cleanSp[k];
      }
    }

    updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();

    await db.collection('users').doc(req.user.uid).update(updates);

    const userDoc = await db.collection('users').doc(req.user.uid).get();
    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: { id: req.user.uid, ...userDoc.data() }
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Helper: upload base64 to seller-assets folder and return public URL
async function uploadSellerAsset(base64, userId, kind) {
  if (!storage) throw new Error('Firebase Storage not initialized');
  const base64Clean = base64.replace(/^data:[^;]+;base64,/, '');
  const buffer = Buffer.from(base64Clean, 'base64');

  let contentType = 'image/jpeg';
  if (base64.includes('data:image/png')) contentType = 'image/png';
  else if (base64.includes('data:image/webp')) contentType = 'image/webp';

  const bucket = admin.storage().bucket();
  const ext = contentType === 'image/png' ? 'png' : (contentType === 'image/webp' ? 'webp' : 'jpg');
  const filePath = `seller-assets/${userId}/${kind}_${Date.now()}.${ext}`;
  const file = bucket.file(filePath);

  await file.save(buffer, { metadata: { contentType } });
  await file.makePublic();
  return `https://storage.googleapis.com/${bucket.name}/${filePath}`;
}

// POST /seller-logo — upload seller logo (base64, max 2MB)
router.post('/seller-logo', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'seller' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Seller access required' });
    }
    const { logo } = req.body || {};
    if (!logo) return res.status(400).json({ error: 'logo (base64) is required' });

    // size guard: ~2MB after base64 decode (rough)
    if (logo.length > 2.7 * 1024 * 1024) {
      return res.status(400).json({ error: 'Logo must be 2MB or smaller' });
    }

    const url = await uploadSellerAsset(logo, req.user.uid, 'logo');

    await db.collection('users').doc(req.user.uid).update({
      'sellerProfile.logoUrl': url,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ success: true, data: { logoUrl: url } });
  } catch (error) {
    console.error('Error uploading seller logo:', error);
    res.status(500).json({ error: 'Failed to upload logo' });
  }
});

// POST /seller-banner — upload seller banner (base64, max 5MB)
router.post('/seller-banner', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'seller' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Seller access required' });
    }
    const { banner } = req.body || {};
    if (!banner) return res.status(400).json({ error: 'banner (base64) is required' });

    if (banner.length > 6.7 * 1024 * 1024) {
      return res.status(400).json({ error: 'Banner must be 5MB or smaller' });
    }

    const url = await uploadSellerAsset(banner, req.user.uid, 'banner');

    await db.collection('users').doc(req.user.uid).update({
      'sellerProfile.bannerUrl': url,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ success: true, data: { bannerUrl: url } });
  } catch (error) {
    console.error('Error uploading seller banner:', error);
    res.status(500).json({ error: 'Failed to upload banner' });
  }
});

// Get user's bids
router.get('/bids', authMiddleware, async (req, res) => {
  try {
    const bidsSnapshot = await db.collection('bids')
      .where('userId', '==', req.user.uid)
      .orderBy('createdAt', 'desc')
      .get();
    
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
    console.error('Error fetching bids:', error);
    res.status(500).json({ error: 'Failed to fetch bids' });
  }
});

// Get user's orders
router.get('/orders', authMiddleware, async (req, res) => {
  try {
    const ordersSnapshot = await db.collection('orders')
      .where('buyerId', '==', req.user.uid)
      .orderBy('createdAt', 'desc')
      .get();
    
    const orders = ordersSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    res.json({
      success: true,
      data: orders
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Add to watchlist
router.post('/watchlist/:productId', authMiddleware, async (req, res) => {
  try {
    const { productId } = req.params;
    const userId = req.user.uid;
    
    // Check if already in watchlist
    const existingSnapshot = await db.collection('watchlist')
      .where('userId', '==', userId)
      .where('productId', '==', productId)
      .get();
    
    if (!existingSnapshot.empty) {
      // Remove from watchlist
      await existingSnapshot.docs[0].ref.delete();
      
      res.json({
        success: true,
        message: 'Removed from watchlist',
        added: false
      });
    } else {
      // Add to watchlist
      await db.collection('watchlist').add({
        userId,
        productId,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      res.json({
        success: true,
        message: 'Added to watchlist',
        added: true
      });
    }
  } catch (error) {
    console.error('Error updating watchlist:', error);
    res.status(500).json({ error: 'Failed to update watchlist' });
  }
});

// Get watchlist
router.get('/watchlist', authMiddleware, async (req, res) => {
  try {
    const watchlistSnapshot = await db.collection('watchlist')
      .where('userId', '==', req.user.uid)
      .orderBy('createdAt', 'desc')
      .get();
    
    const watchlist = [];
    for (const doc of watchlistSnapshot.docs) {
      const item = doc.data();
      
      // Get product details
      const productDoc = await db.collection('products').doc(item.productId).get();
      if (productDoc.exists) {
        watchlist.push({
          id: doc.id,
          product: {
            id: productDoc.id,
            ...productDoc.data()
          },
          addedAt: item.createdAt
        });
      }
    }
    
    res.json({
      success: true,
      data: watchlist
    });
  } catch (error) {
    console.error('Error fetching watchlist:', error);
    res.status(500).json({ error: 'Failed to fetch watchlist' });
  }
});

// Get seller dashboard stats
router.get('/seller-dashboard', authMiddleware, async (req, res) => {
  try {
    const sellerId = req.user.uid;
    
    // Get seller's products
    const productsSnapshot = await db.collection('products')
      .where('sellerId', '==', sellerId)
      .get();
    
    const products = productsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Get seller's sales (orders where they are the seller)
    const salesSnapshot = await db.collection('orders')
      .where('sellerId', '==', sellerId)
      .get();
    
    const sales = salesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Calculate stats
    const stats = {
      totalListings: products.length,
      activeListings: products.filter(p => p.status === 'active').length,
      soldItems: products.filter(p => p.status === 'sold').length,
      endedAuctions: products.filter(p => p.status === 'ended').length,
      totalSales: sales.filter(s => s.paymentStatus === 'completed').length,
      pendingPayments: sales.filter(s => s.paymentStatus === 'pending').length,
      totalRevenue: sales
        .filter(s => s.paymentStatus === 'completed')
        .reduce((sum, s) => sum + (s.amount || 0), 0),
      totalBids: products.reduce((sum, p) => sum + (p.totalBids || 0), 0),
      totalViews: products.reduce((sum, p) => sum + (p.views || 0), 0),
      averagePrice: products.length > 0 
        ? products.reduce((sum, p) => sum + (p.currentPrice || 0), 0) / products.length 
        : 0
    };
    
    // Get recent activity
    const recentActivity = [];
    
    // Add recent bids on seller's products
    // Sort in-memory to avoid needing a (productId + createdAt) composite index
    for (const product of products.slice(0, 5)) {
      const bidsSnapshot = await db.collection('bids')
        .where('productId', '==', product.id)
        .get();

      if (!bidsSnapshot.empty) {
        const latestBid = bidsSnapshot.docs
          .map(d => d.data())
          .sort((a, b) => {
            const ta = a.createdAt?._seconds ?? a.createdAt?.seconds ?? 0;
            const tb = b.createdAt?._seconds ?? b.createdAt?.seconds ?? 0;
            return tb - ta;
          })[0];

        recentActivity.push({
          type: 'bid',
          productTitle: product.title,
          amount: latestBid.amount,
          userName: latestBid.userName,
          timestamp: latestBid.createdAt
        });
      }
    }
    
    // Sort activity by timestamp
    recentActivity.sort((a, b) => {
      const timeA = a.timestamp?._seconds || 0;
      const timeB = b.timestamp?._seconds || 0;
      return timeB - timeA;
    });
    
    res.json({
      success: true,
      data: {
        stats,
        recentProducts: products.slice(0, 5),
        recentSales: sales.slice(0, 5),
        recentActivity: recentActivity.slice(0, 10)
      }
    });
  } catch (error) {
    console.error('Error fetching seller dashboard:', error);
    res.status(500).json({ error: 'Failed to fetch seller dashboard' });
  }
});

// Upload user avatar
router.post('/avatar', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.uid;
    const { avatar } = req.body; // Base64 encoded image
    
    if (!avatar) {
      return res.status(400).json({ error: 'No avatar image provided' });
    }
    
    // Convert base64 to buffer
    const base64Data = avatar.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    
    // Upload to Firebase Storage
    const bucket = admin.storage().bucket();
    const fileName = `avatars/${userId}-${Date.now()}.png`;
    const file = bucket.file(fileName);
    
    await file.save(buffer, {
      metadata: {
        contentType: 'image/png'
      }
    });
    
    // Make file public
    await file.makePublic();
    
    // Get public URL
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
    
    // Update user document
    await db.collection('users').doc(userId).update({
      avatar: publicUrl,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    res.json({
      success: true,
      message: 'Avatar uploaded successfully',
      data: {
        avatar: publicUrl
      }
    });
  } catch (error) {
    console.error('Error uploading avatar:', error);
    res.status(500).json({ error: 'Failed to upload avatar' });
  }
});

// Update notification preferences
router.put('/notifications', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.uid;
    const { preferences } = req.body;
    
    await db.collection('users').doc(userId).update({
      'preferences.notifications': preferences,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    res.json({
      success: true,
      message: 'Notification preferences updated'
    });
  } catch (error) {
    console.error('Error updating notifications:', error);
    res.status(500).json({ error: 'Failed to update notification preferences' });
  }
});

// Change password
router.put('/password', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.uid;
    const { currentPassword, newPassword } = req.body;
    
    // Validate input
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        error: 'Current password and new password are required' 
      });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ 
        error: 'New password must be at least 6 characters long' 
      });
    }
    
    // Load the user (the Firestore doc id == req.user.uid for both JWT and Firebase-auth sessions).
    const userRef = db.collection('users').doc(userId);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      return res.status(404).json({ error: 'User not found' });
    }
    const userData = userSnap.data();

    const { userUtils } = require('../utils/firestore');

    // Verify the CURRENT password before allowing a change (otherwise any authenticated session
    // could reset the password without knowing it). The backend's own login (auth.js JWT) checks the
    // bcrypt hash in the Firestore `password` field, so that's the authoritative thing to verify.
    // Accounts with no stored password (created purely via the Firebase client SDK) can't be verified
    // server-side without the Firebase Web API key, so they must use the emailed reset flow instead.
    if (!userData.password) {
      return res.status(400).json({
        error: 'Password change is unavailable for this account. Please use "Forgot password" to set a new password.'
      });
    }
    const matches = await userUtils.comparePassword(currentPassword, userData.password);
    if (!matches) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    if (currentPassword === newPassword) {
      return res.status(400).json({ error: 'New password must be different from your current password' });
    }

    // Update BOTH password stores so they never drift:
    //   1) the Firestore bcrypt hash — used by the backend JWT /login path, and
    //   2) the Firebase Auth password — used by Firebase client login.
    // (Previously only Firebase Auth was updated, so JWT login kept accepting the OLD password.)
    const newHash = await userUtils.hashPassword(newPassword);
    await userRef.update({
      password: newHash,
      passwordChangedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Firebase Auth update is best-effort: JWT-only accounts have no Firebase Auth user (their
    // Firestore doc id isn't a Firebase uid), so a user-not-found there is expected and non-fatal —
    // the Firestore hash we just wrote already covers backend login.
    try {
      await admin.auth().updateUser(userId, { password: newPassword });
    } catch (authError) {
      if (authError.code === 'auth/user-not-found') {
        console.log('changePassword: no Firebase Auth user for', userId, '- Firestore password updated only');
      } else {
        console.error('changePassword: Firebase Auth update failed (Firestore already updated):', authError.code || authError.message);
      }
    }

    res.json({
      success: true,
      message: 'Password updated successfully'
    });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({
      error: 'Failed to change password'
    });
  }
});

// Get user activity (bids, wins, watchlist)
router.get('/activity', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.uid;
    
    // Get user's bids
    let bidsSnapshot;
    try {
      bidsSnapshot = await db.collection('bids')
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(10)
        .get();
    } catch (error) {
      // Fallback without orderBy if index is missing
      bidsSnapshot = await db.collection('bids')
        .where('userId', '==', userId)
        .limit(10)
        .get();
    }
    
    const bids = [];
    for (const doc of bidsSnapshot.docs) {
      const bid = { id: doc.id, ...doc.data() };
      // Get product info
      const productDoc = await db.collection('products').doc(bid.productId).get();
      if (productDoc.exists) {
        bid.product = {
          id: productDoc.id,
          title: productDoc.data().title,
          image: productDoc.data().images?.[0]
        };
      }
      bids.push(bid);
    }
    
    // Get won auctions
    let winsSnapshot;
    try {
      winsSnapshot = await db.collection('products')
        .where('winnerId', '==', userId)
        .orderBy('endedAt', 'desc')
        .limit(10)
        .get();
    } catch (error) {
      // Fallback without orderBy if index is missing
      winsSnapshot = await db.collection('products')
        .where('winnerId', '==', userId)
        .limit(10)
        .get();
    }
    
    const wins = winsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Get watchlist items
    const userDoc = await db.collection('users').doc(userId).get();
    const watchlist = userDoc.data()?.watchlist || [];
    
    res.json({
      success: true,
      data: {
        bids,
        wins,
        watchlist,
        stats: {
          totalBids: bids.length,
          totalWins: wins.length,
          watchlistCount: watchlist.length
        }
      }
    });
  } catch (error) {
    console.error('Error fetching user activity:', error);
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

module.exports = router;