const express = require('express');
const router = express.Router();
const { admin, db, auth, storage } = require('../config/firebase');
const { authMiddleware } = require('../middleware/auth');
const emailService = require('../services/resendEmailService');
const { deleteUserFully } = require('../utils/adminDelete');
const { withSignedDocuments } = require('./kyc');

// Normalize a category slug (lowercase, hyphenated, alphanumeric only).
const slugifyCategory = (value) =>
  String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

// Admin middleware - check if user is admin
const adminMiddleware = async (req, res, next) => {
  try {
    const userId = req.user.uid;
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userData = userDoc.data();
    if (userData.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    next();
  } catch (error) {
    console.error('Admin middleware error:', error);
    res.status(500).json({ error: 'Authentication error' });
  }
};

// Get admin dashboard stats
router.get('/dashboard', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    // Get all collections counts
    const usersSnapshot = await db.collection('users').get();
    const productsSnapshot = await db.collection('products').get();
    const ordersSnapshot = await db.collection('orders').get();
    const bidsSnapshot = await db.collection('bids').get();
    const categoriesSnapshot = await db.collection('categories').get();
    
    // Calculate user stats
    const users = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const userStats = {
      total: users.length,
      admins: users.filter(u => u.role === 'admin').length,
      sellers: users.filter(u => u.role === 'seller').length,
      buyers: users.filter(u => u.role === 'user' || !u.role).length,
      verified: users.filter(u => u.verified).length,
      activeToday: users.filter(u => {
        const lastActive = u.lastActiveAt?._seconds ? 
          new Date(u.lastActiveAt._seconds * 1000) : null;
        return lastActive && (Date.now() - lastActive.getTime()) < 24 * 60 * 60 * 1000;
      }).length
    };
    
    // Calculate product stats
    const products = productsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const productStats = {
      total: products.length,
      active: products.filter(p => p.status === 'active').length,
      ended: products.filter(p => p.status === 'ended').length,
      sold: products.filter(p => p.status === 'sold').length,
      totalValue: products.reduce((sum, p) => sum + Number(p.currentPrice || 0), 0),
      avgPrice: products.length > 0 ?
        products.reduce((sum, p) => sum + Number(p.currentPrice || 0), 0) / products.length : 0
    };
    
    // Calculate order stats
    const orders = ordersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const orderStats = {
      total: orders.length,
      pending: orders.filter(o => o.status === 'pending_payment').length,
      processing: orders.filter(o => o.status === 'processing').length,
      shipped: orders.filter(o => o.status === 'shipped').length,
      delivered: orders.filter(o => o.status === 'delivered').length,
      totalRevenue: orders
        .filter(o => o.paymentStatus === 'completed' || o.paymentStatus === 'paid')
        .reduce((sum, o) => sum + (parseFloat(o.amount) || 0), 0),
      platformFees: orders
        .filter(o => o.paymentStatus === 'completed' || o.paymentStatus === 'paid')
        .reduce((sum, o) => sum + ((parseFloat(o.amount) || 0) * 0.1), 0) // 10% platform fee
    };
    
    // Calculate bid stats
    const bids = bidsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const bidStats = {
      total: bids.length,
      active: bids.filter(b => b.status === 'active').length,
      totalValue: bids.reduce((sum, b) => sum + Number(b.amount || 0), 0),
      uniqueBidders: new Set(bids.map(b => b.userId)).size
    };
    
    // Get recent activities
    const recentActivities = [];
    
    // Recent users
    const recentUsers = users
      .sort((a, b) => {
        const aTime = a.createdAt?._seconds || 0;
        const bTime = b.createdAt?._seconds || 0;
        return bTime - aTime;
      })
      .slice(0, 5)
      .map(u => ({
        type: 'user_joined',
        userName: `${u.firstName} ${u.lastName}`,
        email: u.email,
        timestamp: u.createdAt
      }));
    
    // Recent products
    const recentProducts = products
      .sort((a, b) => {
        const aTime = a.createdAt?._seconds || 0;
        const bTime = b.createdAt?._seconds || 0;
        return bTime - aTime;
      })
      .slice(0, 5)
      .map(p => ({
        type: 'product_listed',
        productTitle: p.title,
        price: p.startingPrice,
        sellerId: p.sellerId,
        timestamp: p.createdAt
      }));
    
    // Recent orders
    const recentOrders = orders
      .sort((a, b) => {
        const aTime = a.createdAt?._seconds || 0;
        const bTime = b.createdAt?._seconds || 0;
        return bTime - aTime;
      })
      .slice(0, 5)
      .map(o => ({
        type: 'order_placed',
        productTitle: o.productTitle,
        amount: o.amount,
        buyerName: o.buyerName,
        timestamp: o.createdAt
      }));
    
    // Merge and sort all activities
    recentActivities.push(...recentUsers, ...recentProducts, ...recentOrders);
    recentActivities.sort((a, b) => {
      const aTime = a.timestamp?._seconds || 0;
      const bTime = b.timestamp?._seconds || 0;
      return bTime - aTime;
    });
    
    res.json({
      success: true,
      data: {
        stats: {
          users: userStats,
          products: productStats,
          orders: orderStats,
          bids: bidStats,
          categories: categoriesSnapshot.size
        },
        recentActivities: recentActivities.slice(0, 15),
        topProducts: products
          .sort((a, b) => (b.views || 0) - (a.views || 0))
          .slice(0, 5),
        topSellers: await getTopSellers()
      }
    });
  } catch (error) {
    console.error('Error fetching admin dashboard:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

// Helper function to get top sellers
async function getTopSellers() {
  const ordersSnapshot = await db.collection('orders').get();

  const sellerRevenue = {};
  ordersSnapshot.docs.forEach(doc => {
    const order = doc.data();
    if (order.sellerId && (order.paymentStatus === 'completed' || order.paymentStatus === 'paid')) {
      sellerRevenue[order.sellerId] = (sellerRevenue[order.sellerId] || 0) + (parseFloat(order.amount) || 0);
    }
  });
  
  const topSellerIds = Object.entries(sellerRevenue)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([id]) => id);
  
  const sellers = [];
  for (const sellerId of topSellerIds) {
    const userDoc = await db.collection('users').doc(sellerId).get();
    if (userDoc.exists) {
      const userData = userDoc.data();
      sellers.push({
        id: sellerId,
        name: `${userData.firstName} ${userData.lastName}`,
        email: userData.email,
        revenue: sellerRevenue[sellerId]
      });
    }
  }
  
  return sellers;
}

// Get all users (no pagination for simplicity in admin panel)
router.get('/users', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { role, search } = req.query;
    
    let query = db.collection('users');
    
    if (role && role !== 'all') {
      query = query.where('role', '==', role);
    }
    
    const snapshot = await query.get();
    let users = snapshot.docs.map(doc => ({
      id: doc.id,
      uid: doc.id, // Add uid field for compatibility
      ...doc.data(),
      name: doc.data().displayName || `${doc.data().firstName || ''} ${doc.data().lastName || ''}`.trim() || 'Unknown User'
    }));
    
    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      users = users.filter(u => 
        u.email?.toLowerCase().includes(searchLower) ||
        u.name?.toLowerCase().includes(searchLower)
      );
    }
    
    // Add order statistics for each user
    for (let user of users) {
      const ordersSnapshot = await db.collection('orders')
        .where('buyerId', '==', user.id)
        .get();
      
      user.totalOrders = ordersSnapshot.size;
      user.totalSpent = ordersSnapshot.docs.reduce((sum, doc) => {
        const order = doc.data();
        return sum + (order.totalAmount || 0);
      }, 0);
      
      // Set default status if not present
      if (!user.status) {
        user.status = user.suspended ? 'suspended' : 'active';
      }
    }
    
    // Sort by creation date
    users.sort((a, b) => {
      const aTime = a.createdAt?._seconds || 0;
      const bTime = b.createdAt?._seconds || 0;
      return bTime - aTime;
    });
    
    res.json({
      success: true,
      data: users
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Update user role specifically
router.put('/users/:userId/role', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;
    
    if (!role || !['user', 'seller', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    
    // Don't allow removing the last admin
    if (role !== 'admin') {
      const userDoc = await db.collection('users').doc(userId).get();
      if (userDoc.exists && userDoc.data().role === 'admin') {
        // Check if there are other admins
        const adminsSnapshot = await db.collection('users')
          .where('role', '==', 'admin')
          .get();
        if (adminsSnapshot.size === 1) {
          return res.status(400).json({ error: 'Cannot remove the last admin' });
        }
      }
    }
    
    if (!db) {
      return res.status(500).json({ error: 'Database connection unavailable' });
    }

    // Use admin.firestore.FieldValue via the imported admin object
    const timestamp = admin ? admin.firestore.FieldValue.serverTimestamp() : new Date();

    await db.collection('users').doc(userId).update({
      role: role,
      updatedAt: timestamp,
      updatedBy: req.user.uid
    });
    
    res.json({
      success: true,
      message: 'User role updated successfully'
    });
  } catch (error) {
    console.error('Error updating user role:', error);
    res.status(500).json({ error: 'Failed to update user role' });
  }
});

// Update user status and other properties
router.put('/users/:userId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const { status, verified, suspended, role } = req.body;
    
    const updates = {};
    if (status !== undefined) {
      updates.status = status;
      // Map status to suspended field for backward compatibility
      updates.suspended = status === 'suspended';
    }
    if (verified !== undefined) updates.verified = verified;
    if (suspended !== undefined) {
      updates.suspended = suspended;
      updates.status = suspended ? 'suspended' : 'active';
    }
    if (role !== undefined) updates.role = role;
    
    const timestamp = admin ? admin.firestore.FieldValue.serverTimestamp() : new Date();
    updates.updatedAt = timestamp;
    updates.updatedBy = req.user.uid;

    if (!db) {
      return res.status(500).json({ error: 'Database connection unavailable' });
    }

    await db.collection('users').doc(userId).update(updates);
    
    res.json({
      success: true,
      message: 'User updated successfully'
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Delete user account
router.delete('/users/:userId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    // Full removal: Firebase Auth account + user doc + the user's footprint (products, bids,
    // reviews, orders, etc.). Blocks admin accounts. See utils/adminDelete.js.
    await deleteUserFully(userId);
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    if (error.message === 'Cannot delete an admin user') {
      return res.status(400).json({ error: 'Cannot delete admin accounts' });
    }
    if (error.message === 'User not found') {
      return res.status(404).json({ error: 'User not found' });
    }
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Get all products for moderation
router.get('/products', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 2000, status, search } = req.query;
    const offset = (page - 1) * limit;
    
    let query = db.collection('products');
    
    if (status && status !== 'all') {
      query = query.where('status', '==', status);
    }
    
    const snapshot = await query.get();
    let products = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      products = products.filter(p => 
        p.title?.toLowerCase().includes(searchLower) ||
        p.description?.toLowerCase().includes(searchLower)
      );
    }
    
    // Sort by creation date
    products.sort((a, b) => {
      const aTime = a.createdAt?._seconds || 0;
      const bTime = b.createdAt?._seconds || 0;
      return bTime - aTime;
    });
    
    // Get seller info for each product
    for (const product of products) {
      if (product.sellerId) {
        const sellerDoc = await db.collection('users').doc(product.sellerId).get();
        if (sellerDoc.exists) {
          const seller = sellerDoc.data();
          product.sellerName = `${seller.firstName} ${seller.lastName}`;
          product.sellerEmail = seller.email;
        }
      }
    }
    
    // Paginate
    const paginatedProducts = products.slice(offset, offset + parseInt(limit));
    
    res.json({
      success: true,
      data: {
        products: paginatedProducts,
        total: products.length,
        page: parseInt(page),
        totalPages: Math.ceil(products.length / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Approve/reject product
router.put('/products/:productId/status', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { productId } = req.params;
    const { status, reason } = req.body;
    
    const timestamp = admin ? admin.firestore.FieldValue.serverTimestamp() : new Date();
    const updates = {
      status,
      moderatedAt: timestamp,
      moderatedBy: req.user.uid
    };

    if (reason) {
      updates.moderationReason = reason;
    }

    if (!db) {
      return res.status(500).json({ error: 'Database connection unavailable' });
    }

    await db.collection('products').doc(productId).update(updates);
    
    res.json({
      success: true,
      message: 'Product status updated successfully'
    });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// Delete product
router.delete('/products/:productId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { productId } = req.params;
    
    // Delete product
    await db.collection('products').doc(productId).delete();
    
    // Delete associated bids
    const bidsSnapshot = await db.collection('bids')
      .where('productId', '==', productId)
      .get();
    
    const batch = db.batch();
    bidsSnapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    await batch.commit();
    
    res.json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// Get all categories
router.get('/categories', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    // NOTE: do NOT use .orderBy('order') here — Firestore silently EXCLUDES any document that
    // is missing the 'order' field, which hid older categories created without it. Fetch all,
    // then sort in memory (missing order treated as 0, tie-broken by name).
    const categoriesSnapshot = await db.collection('categories').get();

    const categories = categoriesSnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) =>
        (Number(a.order ?? 0) - Number(b.order ?? 0)) ||
        String(a.name || '').localeCompare(String(b.name || ''))
      );

    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Create category
router.post('/categories', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { name, icon, description, order, slug } = req.body;

    if (!db) {
      return res.status(500).json({ error: 'Database connection unavailable' });
    }

    const timestamp = admin ? admin.firestore.FieldValue.serverTimestamp() : new Date();
    const categoryData = {
      name,
      slug: slugifyCategory(slug || name),
      icon,
      description,
      order: order || 0,
      createdAt: timestamp,
      createdBy: req.user.uid
    };

    const docRef = await db.collection('categories').add(categoryData);
    
    res.status(201).json({
      success: true,
      data: {
        id: docRef.id,
        ...categoryData
      }
    });
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

// Update category
router.put('/categories/:categoryId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { name, icon, description, order, slug } = req.body;

    if (!db) {
      return res.status(500).json({ error: 'Database connection unavailable' });
    }

    const timestamp = admin ? admin.firestore.FieldValue.serverTimestamp() : new Date();
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (slug !== undefined) updates.slug = slugifyCategory(slug || name || '');
    if (icon !== undefined) updates.icon = icon;
    if (description !== undefined) updates.description = description;
    if (order !== undefined) updates.order = order;

    updates.updatedAt = timestamp;
    updates.updatedBy = req.user.uid;

    await db.collection('categories').doc(categoryId).update(updates);
    
    res.json({
      success: true,
      message: 'Category updated successfully'
    });
  } catch (error) {
    console.error('Error updating category:', error);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

// Delete category
router.delete('/categories/:categoryId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { categoryId } = req.params;
    
    // Check if any products use this category
    const productsSnapshot = await db.collection('products')
      .where('categoryId', '==', categoryId)
      .limit(1)
      .get();
    
    if (!productsSnapshot.empty) {
      return res.status(400).json({ 
        error: 'Cannot delete category with existing products' 
      });
    }
    
    await db.collection('categories').doc(categoryId).delete();
    
    res.json({
      success: true,
      message: 'Category deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

// Get system settings
router.get('/settings', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const settingsDoc = await db.collection('settings').doc('general').get();
    
    const defaultSettings = {
      platformFeePercentage: 10,
      minBidIncrement: 100,
      maxAuctionDuration: 30,
      emailNotifications: true,
      autoEndAuctions: true,
      requireVerification: false
    };
    
    const settings = settingsDoc.exists ? settingsDoc.data() : defaultSettings;
    
    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Update system settings
router.put('/settings', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ error: 'Database connection unavailable' });
    }

    const timestamp = admin ? admin.firestore.FieldValue.serverTimestamp() : new Date();
    const updates = {
      ...req.body,
      updatedAt: timestamp,
      updatedBy: req.user.uid
    };

    await db.collection('settings').doc('general').set(updates, { merge: true });
    
    res.json({
      success: true,
      message: 'Settings updated successfully'
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Get all shipments for admin
router.get('/shipments', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const shipmentsSnapshot = await db.collection('shipments').get();
    const ordersSnapshot = await db.collection('orders')
      .where('trackingNumber', '!=', null)
      .get();
    
    // Combine shipment and order data
    const shipments = [];
    for (const doc of ordersSnapshot.docs) {
      const order = doc.data();
      const shipmentDoc = await db.collection('shipments').doc(doc.id).get();
      
      // Get product details
      let product = {};
      if (order.productId) {
        const productDoc = await db.collection('products').doc(order.productId).get();
        if (productDoc.exists) {
          product = productDoc.data();
        }
      }
      
      // Get user details
      let buyer = {};
      let seller = {};
      if (order.buyerId) {
        const buyerDoc = await db.collection('users').doc(order.buyerId).get();
        if (buyerDoc.exists) {
          buyer = buyerDoc.data();
        }
      }
      if (order.sellerId) {
        const sellerDoc = await db.collection('users').doc(order.sellerId).get();
        if (sellerDoc.exists) {
          seller = sellerDoc.data();
        }
      }
      
      shipments.push({
        id: doc.id,
        orderId: doc.id,
        trackingNumber: order.trackingNumber,
        status: order.shippingStatus || order.status,
        buyerName: `${buyer.firstName || ''} ${buyer.lastName || ''}`.trim() || 'Unknown',
        sellerName: seller.businessName || `${seller.firstName || ''} ${seller.lastName || ''}`.trim() || 'Unknown',
        productTitle: product.title || order.productTitle || 'Unknown Product',
        createdAt: order.shippedAt || order.createdAt,
        updatedAt: order.updatedAt,
        ...(shipmentDoc.exists ? shipmentDoc.data() : {})
      });
    }
    
    res.json({
      success: true,
      data: shipments
    });
  } catch (error) {
    console.error('Error fetching shipments:', error);
    res.status(500).json({ error: 'Failed to fetch shipments' });
  }
});

// Get shipping statistics
router.get('/shipments/stats', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const ordersSnapshot = await db.collection('orders').get();
    const orders = ordersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    const stats = {
      totalShipments: orders.filter(o => o.trackingNumber).length,
      pendingShipments: orders.filter(o => o.status === 'processing' && !o.trackingNumber).length,
      inTransit: orders.filter(o => o.shippingStatus === 'shipped' || o.shippingStatus === 'in_transit').length,
      delivered: orders.filter(o => o.shippingStatus === 'delivered' || o.status === 'delivered').length,
      cancelled: orders.filter(o => o.shippingStatus === 'cancelled' || o.status === 'cancelled').length
    };
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching shipping stats:', error);
    res.status(500).json({ error: 'Failed to fetch shipping statistics' });
  }
});

// Get shipping settings (active courier provider + any shipping config)
router.get('/shipping/settings', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ error: 'Database connection unavailable' });
    }
    const doc = await db.collection('settings').doc('shipping').get();
    const data = doc.exists ? doc.data() : {};
    const { isValidProvider, DEFAULT_PROVIDER } = require('../utils/shippingSettings');
    const rawProvider = String(data.activeProvider || '').toLowerCase();
    const activeProvider = isValidProvider(rawProvider) ? rawProvider : DEFAULT_PROVIDER;
    res.json({ success: true, data: { ...data, activeProvider } });
  } catch (error) {
    console.error('Error fetching shipping settings:', error);
    res.status(500).json({ error: 'Failed to fetch shipping settings' });
  }
});

// Update shipping settings (e.g. activeProvider: 'usps' | 'ups' | 'freight')
router.post('/shipping/settings', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ error: 'Database connection unavailable' });
    }

    const timestamp = admin ? admin.firestore.FieldValue.serverTimestamp() : new Date();
    const settings = {
      ...req.body,
      updatedAt: timestamp,
      updatedBy: req.user.uid
    };
    // Normalize the provider toggle if present
    if (settings.activeProvider !== undefined) {
      const { isValidProvider, DEFAULT_PROVIDER } = require('../utils/shippingSettings');
      const p = String(settings.activeProvider).toLowerCase();
      settings.activeProvider = isValidProvider(p) ? p : DEFAULT_PROVIDER;
    }

    await db.collection('settings').doc('shipping').set(settings, { merge: true });

    // Invalidate the cached active-provider so the toggle applies immediately.
    try { require('../utils/shippingSettings').clearShippingProviderCache(); } catch (e) {}

    res.json({
      success: true,
      message: 'Shipping settings updated successfully'
    });
  } catch (error) {
    console.error('Error updating shipping settings:', error);
    res.status(500).json({ error: 'Failed to update shipping settings' });
  }
});

// ==================== BID MANAGEMENT ROUTES ====================

const auctionScheduler = require('../services/auctionScheduler');
const socketService = require('../services/socketService');

// Get products that have bids (fast, lightweight endpoint for Manage Bids page)
router.get('/products-with-bids', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    // Single query: get all non-lost/non-cancelled bids
    const bidsSnapshot = await db.collection('bids').get();

    // Aggregate by productId
    const productBidMap = {};
    bidsSnapshot.forEach(doc => {
      const bid = doc.data();
      const pid = bid.productId;
      if (!productBidMap[pid]) {
        productBidMap[pid] = { totalBids: 0, highestBid: 0, activeBids: 0 };
      }
      productBidMap[pid].totalBids++;
      if (Number(bid.amount) > productBidMap[pid].highestBid) {
        productBidMap[pid].highestBid = Number(bid.amount);
      }
      if (bid.status === 'active' || bid.status === 'outbid') {
        productBidMap[pid].activeBids++;
      }
    });

    const productIds = Object.keys(productBidMap);
    if (productIds.length === 0) {
      return res.json({ success: true, data: [] });
    }

    // Fetch only products that have bids (batch in chunks of 30 for Firestore 'in' limit)
    const products = [];
    for (let i = 0; i < productIds.length; i += 30) {
      const chunk = productIds.slice(i, i + 30);
      const snapshot = await db.collection('products')
        .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
        .get();
      snapshot.forEach(doc => {
        const data = doc.data();
        const bidInfo = productBidMap[doc.id];
        products.push({
          id: doc.id,
          title: data.title,
          images: data.images,
          currentPrice: data.currentPrice || data.startingPrice,
          startingPrice: data.startingPrice,
          status: data.status,
          endDate: data.endDate,
          sellerName: data.sellerName || '',
          totalBids: bidInfo.totalBids,
          activeBids: bidInfo.activeBids,
          highestBid: bidInfo.highestBid
        });
      });
    }

    // Sort: active first, then by totalBids desc
    products.sort((a, b) => {
      if (a.status === 'active' && b.status !== 'active') return -1;
      if (b.status === 'active' && a.status !== 'active') return 1;
      return b.totalBids - a.totalBids;
    });

    res.json({ success: true, data: products });
  } catch (error) {
    console.error('Error fetching products with bids:', error);
    res.status(500).json({ error: 'Failed to fetch products with bids' });
  }
});

// Get all bids for a product (admin only)
router.get('/products/:productId/bids', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { productId } = req.params;

    // Get product info
    const productDoc = await db.collection('products').doc(productId).get();
    if (!productDoc.exists) {
      return res.status(404).json({ error: 'Product not found' });
    }
    const product = { id: productDoc.id, ...productDoc.data() };

    // Get all bids for this product, sorted by amount desc
    const bidsSnapshot = await db.collection('bids')
      .where('productId', '==', productId)
      .orderBy('amount', 'desc')
      .get();

    // Collect unique userIds and batch-fetch emails
    const bidDocs = bidsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const uniqueUserIds = [...new Set(bidDocs.map(b => b.userId))];
    const userEmailMap = {};
    // Fetch users in chunks of 30 (Firestore 'in' limit)
    for (let i = 0; i < uniqueUserIds.length; i += 30) {
      const chunk = uniqueUserIds.slice(i, i + 30);
      const usersSnapshot = await db.collection('users')
        .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
        .get();
      usersSnapshot.forEach(doc => {
        userEmailMap[doc.id] = doc.data().email || '';
      });
    }

    const bids = bidDocs.map(bid => ({
      ...bid,
      bidderEmail: userEmailMap[bid.userId] || ''
    }));

    res.json({
      success: true,
      data: {
        product,
        bids
      }
    });
  } catch (error) {
    console.error('Error fetching product bids:', error);
    res.status(500).json({ error: 'Failed to fetch bids' });
  }
});

// Accept a specific bid (admin only)
router.post('/bids/:bidId/accept', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { bidId } = req.params;
    const adminUserId = req.user.uid;

    // Get the bid to find the productId
    const bidDoc = await db.collection('bids').doc(bidId).get();
    if (!bidDoc.exists) {
      return res.status(404).json({ error: 'Bid not found' });
    }
    const bid = bidDoc.data();

    // Call auctionScheduler.acceptBid
    const result = await auctionScheduler.acceptBid(bid.productId, bidId, adminUserId);

    // Emit socket event so all viewers see auction ended
    socketService.emitToAuction(bid.productId, 'auction-ended', {
      productId: bid.productId,
      winnerId: result.winnerId,
      winnerName: result.winnerName,
      finalPrice: result.amount,
      orderId: result.orderId
    });

    res.json({
      success: true,
      message: `Bid accepted! Order created for ${result.winnerName}`,
      data: result
    });
  } catch (error) {
    console.error('Error accepting bid:', error);
    res.status(400).json({ error: error.message || 'Failed to accept bid' });
  }
});

// ==================== KYC MANAGEMENT ROUTES ====================

// Get all pending KYC submissions
router.get('/kyc/pending', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status = 'PENDING' } = req.query;

    let usersQuery = db.collection('users');

    // Filter by KYC status
    if (status && status !== 'all') {
      usersQuery = usersQuery.where('kycStatus', '==', status);
    }

    const snapshot = await usersQuery.get();

    const users = [];
    snapshot.forEach(doc => {
      const userData = doc.data();
      // Only include users who have submitted KYC
      if (userData.kycStatus && userData.kycStatus !== 'NOT_SUBMITTED') {
        users.push({
          id: doc.id,
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          name: `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || userData.email,
          kycStatus: userData.kycStatus,
          kycSubmittedAt: userData.kycSubmittedAt,
          kycReviewedAt: userData.kycReviewedAt,
          kycDocuments: userData.kycDocuments ? {
            idType: userData.kycDocuments.idType,
            hasIdDocument: !!userData.kycDocuments.idDocument,
            hasSelfie: !!userData.kycDocuments.selfie
          } : null
        });
      }
    });

    // Sort by submission date (newest first)
    users.sort((a, b) => {
      const aTime = a.kycSubmittedAt?._seconds || 0;
      const bTime = b.kycSubmittedAt?._seconds || 0;
      return bTime - aTime;
    });

    res.json({
      success: true,
      data: users,
      total: users.length
    });
  } catch (error) {
    console.error('Error fetching KYC submissions:', error);
    res.status(500).json({ error: 'Failed to fetch KYC submissions' });
  }
});

// Get specific user's KYC documents
router.get('/kyc/:userId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;

    const userDoc = await db.collection('users').doc(userId).get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userData = userDoc.data();

    if (!userData.kycDocuments) {
      return res.status(404).json({ error: 'No KYC documents found for this user' });
    }

    res.json({
      success: true,
      data: {
        userId: userId,
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        name: `${userData.firstName || ''} ${userData.lastName || ''}`.trim(),
        kycStatus: userData.kycStatus,
        kycSubmittedAt: userData.kycSubmittedAt,
        kycReviewedAt: userData.kycReviewedAt,
        kycReviewedBy: userData.kycReviewedBy,
        kycRejectionReason: userData.kycRejectionReason,
        // Signed on the way out: the stored values are private Storage paths,
        // so the reviewer gets a URL that works for 15 minutes and then dies.
        kycDocuments: await withSignedDocuments({
          idType: userData.kycDocuments.idType,
          idNumber: userData.kycDocuments.idNumber,
          idDocument: userData.kycDocuments.idDocument,
          selfie: userData.kycDocuments.selfie
        })
      }
    });
  } catch (error) {
    console.error('Error fetching KYC documents:', error);
    res.status(500).json({ error: 'Failed to fetch KYC documents' });
  }
});

// Approve or reject KYC
router.put('/kyc/:userId/review', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const { status, rejectionReason } = req.body;
    const adminId = req.user.uid;

    // Validate status
    if (!status || !['APPROVED', 'REJECTED'].includes(status)) {
      return res.status(400).json({
        error: 'Invalid status. Must be APPROVED or REJECTED'
      });
    }

    // If rejecting, reason is required
    if (status === 'REJECTED' && !rejectionReason) {
      return res.status(400).json({
        error: 'Rejection reason is required when rejecting KYC'
      });
    }

    // Get user document
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userData = userDoc.data();

    // Check if user has pending KYC
    if (userData.kycStatus !== 'PENDING') {
      return res.status(400).json({
        error: `Cannot review KYC. Current status is: ${userData.kycStatus || 'NOT_SUBMITTED'}`
      });
    }

    // Prepare update data
    const timestamp = admin ? admin.firestore.FieldValue.serverTimestamp() : new Date();
    const updateData = {
      kycStatus: status,
      kycReviewedAt: timestamp,
      kycReviewedBy: adminId,
      updatedAt: timestamp
    };

    // Add rejection reason if rejected
    if (status === 'REJECTED') {
      updateData.kycRejectionReason = rejectionReason;
    } else {
      // Clear rejection reason if approved
      updateData.kycRejectionReason = null;
      // Also set verified flag to true when KYC is approved
      updateData.verified = true;
    }

    await userRef.update(updateData);

    console.log(`KYC ${status} for user ${userId} by admin ${adminId}`);

    // Send KYC status email
    try {
      if (status === 'APPROVED') {
        await emailService.sendKYCApprovedEmail({
          email: userData.email,
          firstName: userData.firstName
        });
      } else {
        await emailService.sendKYCRejectedEmail({
          email: userData.email,
          firstName: userData.firstName,
          reason: rejectionReason
        });
      }
    } catch (emailError) {
      console.error('Error sending KYC email:', emailError);
    }

    res.json({
      success: true,
      message: `KYC ${status.toLowerCase()} successfully`,
      data: {
        userId: userId,
        kycStatus: status,
        reviewedAt: new Date().toISOString(),
        reviewedBy: adminId
      }
    });
  } catch (error) {
    console.error('Error reviewing KYC:', error);
    res.status(500).json({ error: 'Failed to review KYC' });
  }
});

// Get pending counts for admin badges
// Short-lived cache so frequent admin polling doesn't run 6 Firestore count queries each time.
let pendingCountsCache = { at: 0, data: null };

router.get('/pending-counts', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    if (pendingCountsCache.data && Date.now() - pendingCountsCache.at < 10000) {
      return res.json({ success: true, data: pendingCountsCache.data });
    }

    // Run all count queries in parallel instead of sequentially.
    const [
      pendingOrdersSnapshot,
      processingOrdersSnapshot,
      pendingWithdrawalsSnapshot,
      pendingKycSnapshot,
      pendingSellerAppsSnapshot,
      activeBidsSnapshot
    ] = await Promise.all([
      db.collection('orders').where('status', '==', 'pending_payment').get(),
      db.collection('orders').where('status', '==', 'processing').get(),
      db.collection('withdrawals').where('status', '==', 'pending').get(),
      db.collection('users').where('kycStatus', '==', 'PENDING').get(),
      db.collection('users').where('sellerApplication.status', '==', 'PENDING').get(),
      db.collection('bids').where('status', 'in', ['active', 'outbid']).get()
    ]);

    const result = {
      pendingOrders: pendingOrdersSnapshot.size,
      processingOrders: processingOrdersSnapshot.size,
      pendingWithdrawals: pendingWithdrawalsSnapshot.size,
      pendingKyc: pendingKycSnapshot.size,
      pendingSellerApplications: pendingSellerAppsSnapshot.size,
      activeBids: activeBidsSnapshot.size,
      totalPending: pendingOrdersSnapshot.size + processingOrdersSnapshot.size +
                    pendingWithdrawalsSnapshot.size + pendingKycSnapshot.size +
                    pendingSellerAppsSnapshot.size
    };

    pendingCountsCache = { at: Date.now(), data: result };

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error fetching pending counts:', error);
    res.status(500).json({ error: 'Failed to fetch pending counts' });
  }
});

// Get KYC statistics
router.get('/kyc/stats/overview', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const usersSnapshot = await db.collection('users').get();

    const stats = {
      total: 0,
      notSubmitted: 0,
      pending: 0,
      approved: 0,
      rejected: 0
    };

    usersSnapshot.forEach(doc => {
      const userData = doc.data();
      stats.total++;

      switch (userData.kycStatus) {
        case 'PENDING':
          stats.pending++;
          break;
        case 'APPROVED':
          stats.approved++;
          break;
        case 'REJECTED':
          stats.rejected++;
          break;
        default:
          stats.notSubmitted++;
      }
    });

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching KYC stats:', error);
    res.status(500).json({ error: 'Failed to fetch KYC statistics' });
  }
});

// PUT /admin/users/:userId/verify-seller — toggle verifiedSeller flag
router.put('/users/:userId/verify-seller', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const { verified } = req.body || {};
    if (typeof verified !== 'boolean') {
      return res.status(400).json({ error: 'verified (boolean) is required' });
    }

    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) return res.status(404).json({ error: 'User not found' });

    const userData = userDoc.data();
    if (userData.role !== 'seller' && userData.role !== 'admin') {
      return res.status(400).json({ error: 'User is not a seller' });
    }

    await userRef.update({
      'sellerProfile.verifiedSeller': verified,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({
      success: true,
      message: `Seller ${verified ? 'verified' : 'unverified'}`,
      data: { userId, verifiedSeller: verified }
    });
  } catch (error) {
    console.error('Verify seller error:', error);
    res.status(500).json({ error: 'Failed to update verification' });
  }
});

// ==================== SELLER APPLICATION MANAGEMENT ====================

// Slug helper — kebab-case, alphanumeric+dash only, max 40 chars
function slugify(input) {
  return String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 40);
}

// Generate a unique seller slug; falls back to userId if all candidates collide
async function generateUniqueSlug(baseName, userId) {
  const base = slugify(baseName) || userId;
  const candidates = [base, `${base}-${userId.slice(0, 6)}`, userId];

  for (const candidate of candidates) {
    const existing = await db.collection('users')
      .where('sellerProfile.slug', '==', candidate)
      .limit(1)
      .get();
    if (existing.empty) return candidate;
  }
  return userId; // ultimate fallback
}

// GET /admin/seller-applications/pending — list applications by status
router.get('/seller-applications/pending', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status = 'PENDING' } = req.query;

    let query = db.collection('users');
    if (status && status !== 'all') {
      query = query.where('sellerApplication.status', '==', status);
    }

    const snapshot = await query.get();

    const apps = [];
    snapshot.forEach(doc => {
      const userData = doc.data();
      const app = userData.sellerApplication;
      if (!app) return;
      // When status='all', skip those who never submitted
      if (status === 'all' && app.status === 'NOT_SUBMITTED') return;

      apps.push({
        id: doc.id,
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        name: `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || userData.email,
        kycStatus: userData.kycStatus || 'NOT_SUBMITTED',
        role: userData.role || 'user',
        application: {
          status: app.status,
          submittedAt: app.submittedAt,
          reviewedAt: app.reviewedAt,
          fullName: app.fullName,
          companyName: app.companyName,
          phoneNumber: app.phoneNumber
        }
      });
    });

    apps.sort((a, b) => {
      const aTime = a.application.submittedAt?._seconds || 0;
      const bTime = b.application.submittedAt?._seconds || 0;
      return bTime - aTime;
    });

    res.json({ success: true, data: apps, total: apps.length });
  } catch (error) {
    console.error('Error fetching seller applications:', error);
    res.status(500).json({ error: 'Failed to fetch seller applications' });
  }
});

// GET /admin/seller-applications/stats/overview — count by status
router.get('/seller-applications/stats/overview', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const snapshot = await db.collection('users').get();
    const stats = { total: 0, notSubmitted: 0, pending: 0, approved: 0, rejected: 0, sellers: 0 };

    snapshot.forEach(doc => {
      const data = doc.data();
      stats.total++;
      if (data.role === 'seller') stats.sellers++;
      const s = data.sellerApplication?.status;
      switch (s) {
        case 'PENDING': stats.pending++; break;
        case 'APPROVED': stats.approved++; break;
        case 'REJECTED': stats.rejected++; break;
        default: stats.notSubmitted++;
      }
    });

    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Error fetching seller application stats:', error);
    res.status(500).json({ error: 'Failed to fetch seller application stats' });
  }
});

// GET /admin/seller-applications/:userId — full application details
router.get('/seller-applications/:userId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const userDoc = await db.collection('users').doc(userId).get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userData = userDoc.data();
    if (!userData.sellerApplication) {
      return res.status(404).json({ error: 'No seller application for this user' });
    }

    res.json({
      success: true,
      data: {
        userId,
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        name: `${userData.firstName || ''} ${userData.lastName || ''}`.trim(),
        role: userData.role || 'user',
        kycStatus: userData.kycStatus || 'NOT_SUBMITTED',
        application: userData.sellerApplication
      }
    });
  } catch (error) {
    console.error('Error fetching seller application:', error);
    res.status(500).json({ error: 'Failed to fetch seller application' });
  }
});

// PUT /admin/seller-applications/:userId/review — approve or reject
router.put('/seller-applications/:userId/review', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const { status, rejectionReason } = req.body;
    const adminId = req.user.uid;

    if (!status || !['APPROVED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be APPROVED or REJECTED' });
    }
    if (status === 'REJECTED' && !rejectionReason) {
      return res.status(400).json({ error: 'Rejection reason is required when rejecting' });
    }

    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userData = userDoc.data();
    const app = userData.sellerApplication;
    if (!app) {
      return res.status(400).json({ error: 'No seller application to review for this user' });
    }
    if (app.status !== 'PENDING') {
      return res.status(400).json({
        error: `Cannot review application. Current status is: ${app.status}`
      });
    }

    const timestamp = admin ? admin.firestore.FieldValue.serverTimestamp() : new Date();
    const nowIso = new Date().toISOString();

    const updateData = {
      'sellerApplication.status': status,
      'sellerApplication.reviewedAt': timestamp,
      'sellerApplication.reviewedBy': adminId,
      updatedAt: timestamp
    };

    if (status === 'REJECTED') {
      updateData['sellerApplication.rejectionReason'] = rejectionReason;
    } else {
      updateData['sellerApplication.rejectionReason'] = null;
      // Promote to seller and create sellerProfile
      updateData.role = 'seller';
      const slug = await generateUniqueSlug(app.companyName, userId);
      updateData.sellerProfile = {
        businessName: app.companyName,
        slug,
        description: '',
        logoUrl: null,
        bannerUrl: null,
        contactEmail: userData.email,
        returnPolicy: '',
        shippingPolicy: '',
        verifiedSeller: false,
        memberSinceAsSeller: timestamp,
        totalSales: 0,
        totalRevenue: 0,
        activeListings: 0,
        averageRating: 0,
        ratingCount: 0
      };
    }

    await userRef.update(updateData);

    console.log(`Seller application ${status} for ${userId} by admin ${adminId}`);

    // Send email — don't fail the request on email failure
    try {
      if (status === 'APPROVED') {
        await emailService.sendSellerApplicationApprovedEmail({
          email: userData.email,
          firstName: userData.firstName,
          businessName: app.companyName
        });
      } else {
        await emailService.sendSellerApplicationRejectedEmail({
          email: userData.email,
          firstName: userData.firstName,
          reason: rejectionReason
        });
      }
    } catch (emailError) {
      console.error('Error sending seller application email:', emailError);
    }

    res.json({
      success: true,
      message: `Seller application ${status.toLowerCase()} successfully`,
      data: { userId, status, reviewedAt: nowIso, reviewedBy: adminId }
    });
  } catch (error) {
    console.error('Error reviewing seller application:', error);
    res.status(500).json({ error: 'Failed to review seller application' });
  }
});

module.exports = router;