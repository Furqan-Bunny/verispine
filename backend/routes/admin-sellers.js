const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

const PLATFORM_FEE_RATE = 0.1;
const NET_MULTIPLIER = 1 - PLATFORM_FEE_RATE;
const REVENUE_STATUSES = new Set(['paid', 'processing', 'shipped', 'delivered']);
const REVENUE_PAYMENT_STATUSES = new Set(['paid', 'completed']);

function toDate(v) {
  if (!v) return null;
  if (v.toDate) return v.toDate();
  if (v._seconds) return new Date(v._seconds * 1000);
  if (v instanceof Date) return v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function periodStart(period) {
  const map = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };
  const days = map[period] || 30;
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isRevenueOrder(o) {
  return REVENUE_STATUSES.has(o.status) || REVENUE_PAYMENT_STATUSES.has(o.paymentStatus);
}

function sellerNameFromUser(u) {
  return (
    u.sellerProfile?.businessName ||
    u.displayName ||
    `${u.firstName || ''} ${u.lastName || ''}`.trim() ||
    u.username ||
    u.email ||
    'Unknown Seller'
  );
}

async function computeSellerAggregates(sellerId) {
  const [productsSnap, ordersSnap] = await Promise.all([
    db.collection('products').where('sellerId', '==', sellerId).get(),
    db.collection('orders').where('sellerId', '==', sellerId).get()
  ]);

  let productCount = 0;
  let activeListings = 0;
  let lastProductAt = 0;
  productsSnap.forEach(doc => {
    const p = doc.data();
    productCount++;
    if (p.status === 'active' || p.status === 'scheduled') activeListings++;
    const t = toDate(p.createdAt);
    if (t && t.getTime() > lastProductAt) lastProductAt = t.getTime();
  });

  let totalOrders = 0;
  let grossRevenue = 0;
  let lastOrderAt = 0;
  ordersSnap.forEach(doc => {
    const o = doc.data();
    totalOrders++;
    if (isRevenueOrder(o)) grossRevenue += parseFloat(o.amount) || 0;
    const t = toDate(o.createdAt);
    if (t && t.getTime() > lastOrderAt) lastOrderAt = t.getTime();
  });

  return {
    productCount,
    activeListings,
    totalOrders,
    grossRevenue,
    netRevenue: grossRevenue * NET_MULTIPLIER,
    lastActiveAt: Math.max(lastProductAt, lastOrderAt) || null
  };
}

// GET /api/admin/sellers — paginated list with KPIs
router.get('/', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const {
      search = '',
      verified = 'all',
      sortBy = 'revenue',
      page = '1',
      limit = '20'
    } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const pageSize = Math.min(100, Math.max(1, parseInt(limit)));

    const snap = await db.collection('users').where('role', '==', 'seller').get();
    let sellers = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (verified === 'verified') {
      sellers = sellers.filter(u => u.sellerProfile?.verifiedSeller === true);
    } else if (verified === 'unverified') {
      sellers = sellers.filter(u => u.sellerProfile?.verifiedSeller !== true);
    }

    if (search) {
      const s = String(search).toLowerCase();
      sellers = sellers.filter(u =>
        sellerNameFromUser(u).toLowerCase().includes(s) ||
        (u.email || '').toLowerCase().includes(s) ||
        (u.sellerProfile?.slug || '').toLowerCase().includes(s)
      );
    }

    const enriched = await Promise.all(sellers.map(async u => {
      const agg = await computeSellerAggregates(u.id);
      return {
        id: u.id,
        businessName: sellerNameFromUser(u),
        email: u.email || null,
        slug: u.sellerProfile?.slug || null,
        logoUrl: u.sellerProfile?.logoUrl || null,
        verifiedSeller: u.sellerProfile?.verifiedSeller === true,
        memberSinceAsSeller: u.sellerProfile?.memberSinceAsSeller || null,
        averageRating: u.sellerProfile?.averageRating || 0,
        ratingCount: u.sellerProfile?.ratingCount || 0,
        balance: u.balance || 0,
        pendingBalance: u.pendingBalance || 0,
        ...agg
      };
    }));

    const sorters = {
      revenue: (a, b) => b.netRevenue - a.netRevenue,
      sales: (a, b) => b.totalOrders - a.totalOrders,
      rating: (a, b) => b.averageRating - a.averageRating,
      joined: (a, b) => {
        const ta = toDate(a.memberSinceAsSeller)?.getTime() || 0;
        const tb = toDate(b.memberSinceAsSeller)?.getTime() || 0;
        return tb - ta;
      },
      products: (a, b) => b.productCount - a.productCount
    };
    enriched.sort(sorters[sortBy] || sorters.revenue);

    const total = enriched.length;
    const start = (pageNum - 1) * pageSize;
    const paged = enriched.slice(start, start + pageSize);

    res.json({
      success: true,
      data: paged,
      pagination: { total, page: pageNum, limit: pageSize, totalPages: Math.ceil(total / pageSize) }
    });
  } catch (error) {
    console.error('Admin list sellers error:', error);
    res.status(500).json({ error: 'Failed to list sellers' });
  }
});

// GET /api/admin/sellers/:sellerId — full profile
router.get('/:sellerId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const userDoc = await db.collection('users').doc(req.params.sellerId).get();
    if (!userDoc.exists) return res.status(404).json({ error: 'Seller not found' });
    const u = userDoc.data();

    const agg = await computeSellerAggregates(req.params.sellerId);

    res.json({
      success: true,
      data: {
        id: userDoc.id,
        email: u.email || null,
        phone: u.phone || null,
        role: u.role,
        businessName: sellerNameFromUser(u),
        displayName: u.displayName || u.username || null,
        firstName: u.firstName || null,
        lastName: u.lastName || null,
        createdAt: u.createdAt || null,
        lastLoginAt: u.lastLoginAt || null,
        sellerProfile: u.sellerProfile || null,
        sellerApplication: u.sellerApplication || null,
        balance: u.balance || 0,
        pendingBalance: u.pendingBalance || 0,
        heldBalance: u.heldBalance || 0,
        kycStatus: u.kycStatus || 'NOT_SUBMITTED',
        ...agg
      }
    });
  } catch (error) {
    console.error('Admin get seller error:', error);
    res.status(500).json({ error: 'Failed to load seller' });
  }
});

// GET /api/admin/sellers/:sellerId/timeseries
router.get('/:sellerId/timeseries', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const sellerId = req.params.sellerId;
    const period = req.query.period || '30d';
    const start = periodStart(period);

    const [ordersSnap, productsSnap] = await Promise.all([
      db.collection('orders').where('sellerId', '==', sellerId).get(),
      db.collection('products').where('sellerId', '==', sellerId).get()
    ]);
    const productIds = productsSnap.docs.map(d => d.id);

    let newBids = 0;
    for (let i = 0; i < productIds.length; i += 30) {
      const chunk = productIds.slice(i, i + 30);
      if (!chunk.length) break;
      const bidsSnap = await db.collection('bids').where('productId', 'in', chunk).get();
      bidsSnap.forEach(doc => {
        const t = toDate(doc.data().createdAt || doc.data().placedAt);
        if (t && t >= start) newBids++;
      });
    }

    const buckets = {};
    const cursor = new Date(start);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    while (cursor <= end) {
      const key = cursor.toISOString().slice(0, 10);
      buckets[key] = { date: key, grossRevenue: 0, netRevenue: 0, orders: 0 };
      cursor.setDate(cursor.getDate() + 1);
    }

    ordersSnap.forEach(doc => {
      const o = doc.data();
      const t = toDate(o.createdAt);
      if (!t || t < start) return;
      const key = t.toISOString().slice(0, 10);
      if (!buckets[key]) buckets[key] = { date: key, grossRevenue: 0, netRevenue: 0, orders: 0 };
      buckets[key].orders += 1;
      if (isRevenueOrder(o)) {
        const amt = parseFloat(o.amount) || 0;
        buckets[key].grossRevenue += amt;
        buckets[key].netRevenue += amt * NET_MULTIPLIER;
      }
    });

    const series = Object.values(buckets);
    res.json({
      success: true,
      data: {
        period,
        startDate: start.toISOString(),
        series,
        totals: {
          grossRevenue: series.reduce((s, x) => s + x.grossRevenue, 0),
          netRevenue: series.reduce((s, x) => s + x.netRevenue, 0),
          orders: series.reduce((s, x) => s + x.orders, 0),
          newBids
        }
      }
    });
  } catch (error) {
    console.error('Admin seller timeseries error:', error);
    res.status(500).json({ error: 'Failed to load timeseries' });
  }
});

// GET /api/admin/sellers/:sellerId/products
router.get('/:sellerId/products', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status } = req.query;
    const snap = await db.collection('products')
      .where('sellerId', '==', req.params.sellerId)
      .get();
    let products = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (status && status !== 'all') {
      products = products.filter(p => p.status === status);
    }
    products.sort((a, b) => {
      const ta = toDate(a.createdAt)?.getTime() || 0;
      const tb = toDate(b.createdAt)?.getTime() || 0;
      return tb - ta;
    });
    res.json({ success: true, data: products });
  } catch (error) {
    console.error('Admin seller products error:', error);
    res.status(500).json({ error: 'Failed to load seller products' });
  }
});

// GET /api/admin/sellers/:sellerId/orders
router.get('/:sellerId/orders', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status } = req.query;
    const snap = await db.collection('orders')
      .where('sellerId', '==', req.params.sellerId)
      .get();
    let orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (status && status !== 'all') {
      orders = orders.filter(o => o.status === status || o.paymentStatus === status);
    }
    orders.sort((a, b) => {
      const ta = toDate(a.createdAt)?.getTime() || 0;
      const tb = toDate(b.createdAt)?.getTime() || 0;
      return tb - ta;
    });
    res.json({ success: true, data: orders });
  } catch (error) {
    console.error('Admin seller orders error:', error);
    res.status(500).json({ error: 'Failed to load seller orders' });
  }
});

// GET /api/admin/sellers/:sellerId/payouts
router.get('/:sellerId/payouts', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const snap = await db.collection('withdrawals')
      .where('userId', '==', req.params.sellerId)
      .get();
    const payouts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    payouts.sort((a, b) => {
      const ta = toDate(a.requestedAt || a.createdAt)?.getTime() || 0;
      const tb = toDate(b.requestedAt || b.createdAt)?.getTime() || 0;
      return tb - ta;
    });
    res.json({ success: true, data: payouts });
  } catch (error) {
    console.error('Admin seller payouts error:', error);
    res.status(500).json({ error: 'Failed to load payouts' });
  }
});

// GET /api/admin/sellers/:sellerId/activity — derived activity timeline
router.get('/:sellerId/activity', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const sellerId = req.params.sellerId;
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));

    const [userDoc, productsSnap, ordersSnap, withdrawalsSnap, reviewsSnap] = await Promise.all([
      db.collection('users').doc(sellerId).get(),
      db.collection('products').where('sellerId', '==', sellerId).get(),
      db.collection('orders').where('sellerId', '==', sellerId).get(),
      db.collection('withdrawals').where('userId', '==', sellerId).get(),
      db.collection('reviews').where('sellerId', '==', sellerId).get()
    ]);

    const events = [];

    productsSnap.forEach(doc => {
      const p = doc.data();
      const createdAt = toDate(p.createdAt);
      if (createdAt) {
        events.push({
          type: 'product_listed',
          title: `Listed "${p.title}"`,
          detail: p.startingPrice != null ? `Starting price R${p.startingPrice}` : null,
          productId: doc.id,
          timestamp: createdAt.toISOString()
        });
      }
      const updatedAt = toDate(p.updatedAt);
      if (updatedAt && createdAt && updatedAt.getTime() - createdAt.getTime() > 60000 &&
          (p.status === 'sold' || p.status === 'ended')) {
        events.push({
          type: p.status === 'sold' ? 'product_sold' : 'auction_ended',
          title: p.status === 'sold' ? `Sold "${p.title}"` : `Auction ended for "${p.title}"`,
          detail: p.currentPrice != null ? `Final price R${p.currentPrice}` : null,
          productId: doc.id,
          timestamp: updatedAt.toISOString()
        });
      }
    });

    ordersSnap.forEach(doc => {
      const o = doc.data();
      const t = toDate(o.createdAt);
      if (t) {
        events.push({
          type: 'order_received',
          title: `Received order #${doc.id.slice(0, 8)}`,
          detail: `R${parseFloat(o.amount || 0).toFixed(2)} · ${o.paymentStatus || o.status || 'pending'}`,
          orderId: doc.id,
          timestamp: t.toISOString()
        });
      }
    });

    withdrawalsSnap.forEach(doc => {
      const w = doc.data();
      const t = toDate(w.requestedAt || w.createdAt);
      if (t) {
        events.push({
          type: 'payout_requested',
          title: `Requested payout R${parseFloat(w.amount || 0).toFixed(2)}`,
          detail: w.status || 'pending',
          withdrawalId: doc.id,
          timestamp: t.toISOString()
        });
      }
      const updatedAt = toDate(w.updatedAt);
      if (updatedAt && t && updatedAt.getTime() - t.getTime() > 60000 && w.status && w.status !== 'pending') {
        events.push({
          type: 'payout_' + w.status,
          title: `Payout ${w.status}`,
          detail: `R${parseFloat(w.amount || 0).toFixed(2)}`,
          withdrawalId: doc.id,
          timestamp: updatedAt.toISOString()
        });
      }
    });

    reviewsSnap.forEach(doc => {
      const r = doc.data();
      const t = toDate(r.createdAt);
      if (t) {
        events.push({
          type: 'review_received',
          title: `Received ${r.rating || 0}★ review`,
          detail: r.comment ? String(r.comment).slice(0, 80) : null,
          reviewId: doc.id,
          timestamp: t.toISOString()
        });
      }
    });

    if (userDoc.exists) {
      const u = userDoc.data();
      const app = u.sellerApplication || {};
      const reviewedAt = toDate(app.reviewedAt);
      if (reviewedAt && app.status) {
        events.push({
          type: 'application_' + String(app.status).toLowerCase(),
          title: `Seller application ${String(app.status).toLowerCase()}`,
          detail: app.rejectionReason || null,
          timestamp: reviewedAt.toISOString()
        });
      }
      const verifiedAt = toDate(u.sellerProfile?.verifiedAt);
      if (verifiedAt && u.sellerProfile?.verifiedSeller) {
        events.push({
          type: 'verified_by_admin',
          title: 'Verified by admin',
          detail: null,
          timestamp: verifiedAt.toISOString()
        });
      }
      const memberSince = toDate(u.sellerProfile?.memberSinceAsSeller);
      if (memberSince) {
        events.push({
          type: 'became_seller',
          title: 'Became a seller',
          detail: null,
          timestamp: memberSince.toISOString()
        });
      }
    }

    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    res.json({ success: true, data: events.slice(0, limit), total: events.length });
  } catch (error) {
    console.error('Admin seller activity error:', error);
    res.status(500).json({ error: 'Failed to load activity' });
  }
});

module.exports = router;
