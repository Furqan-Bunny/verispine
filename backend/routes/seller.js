const express = require('express');
const router = express.Router();
const { admin, db } = require('../config/firebase');
const { authMiddleware, sellerMiddleware } = require('../middleware/auth');

// Helper: parse a Firestore timestamp / Date / ISO into a JS Date
function toDate(v) {
  if (!v) return null;
  if (v.toDate) return v.toDate();
  if (v._seconds) return new Date(v._seconds * 1000);
  if (v instanceof Date) return v;
  return new Date(v);
}

// Compute the start Date for a period string
function periodStart(period) {
  const now = new Date();
  const map = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };
  const days = map[period] || 30;
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

// GET /api/seller/dashboard/timeseries?period=7d|30d|90d|1y
// Returns daily revenue, order count, new bids
router.get('/dashboard/timeseries', authMiddleware, sellerMiddleware, async (req, res) => {
  try {
    const sellerId = req.user.uid;
    const period = req.query.period || '30d';
    const startDate = periodStart(period);

    // Pull ALL orders for this seller; filter in memory by date (small N)
    const ordersSnap = await db.collection('orders')
      .where('sellerId', '==', sellerId)
      .get();

    // Pull seller products → then their bids in window
    const productsSnap = await db.collection('products')
      .where('sellerId', '==', sellerId)
      .get();
    const productIds = productsSnap.docs.map(d => d.id);

    let bidsInWindow = 0;
    if (productIds.length > 0) {
      // Firestore 'in' operator caps at 30 items in modern SDKs; chunk
      const chunks = [];
      for (let i = 0; i < productIds.length; i += 30) {
        chunks.push(productIds.slice(i, i + 30));
      }
      for (const chunk of chunks) {
        const bidsSnap = await db.collection('bids')
          .where('productId', 'in', chunk)
          .get();
        bidsSnap.forEach(doc => {
          const created = toDate(doc.data().createdAt || doc.data().placedAt);
          if (created && created >= startDate) bidsInWindow++;
        });
      }
    }

    // Bucket revenue + order count by day
    const buckets = {};
    const cursor = new Date(startDate);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    while (cursor <= end) {
      const key = cursor.toISOString().slice(0, 10);
      buckets[key] = { date: key, revenue: 0, orders: 0 };
      cursor.setDate(cursor.getDate() + 1);
    }

    ordersSnap.forEach(doc => {
      const o = doc.data();
      const created = toDate(o.createdAt);
      if (!created || created < startDate) return;
      const key = created.toISOString().slice(0, 10);
      if (!buckets[key]) buckets[key] = { date: key, revenue: 0, orders: 0 };
      buckets[key].orders += 1;
      // Only count revenue once paid/processing/shipped/delivered (not cancelled/pending_payment)
      if (['paid', 'processing', 'shipped', 'delivered'].includes(o.status) ||
          ['paid', 'completed'].includes(o.paymentStatus)) {
        // Seller share is amount * 0.9 (10% platform fee) — show seller-attributable revenue
        buckets[key].revenue += (o.amount || 0) * 0.9;
      }
    });

    const series = Object.values(buckets);

    res.json({
      success: true,
      data: {
        period,
        startDate: startDate.toISOString(),
        series,
        totals: {
          revenue: series.reduce((s, x) => s + x.revenue, 0),
          orders: series.reduce((s, x) => s + x.orders, 0),
          newBids: bidsInWindow
        }
      }
    });
  } catch (error) {
    console.error('Seller timeseries error:', error);
    res.status(500).json({ error: 'Failed to load timeseries' });
  }
});

// GET /api/seller/dashboard/top-products?limit=5
router.get('/dashboard/top-products', authMiddleware, sellerMiddleware, async (req, res) => {
  try {
    const sellerId = req.user.uid;
    const limit = Math.min(parseInt(req.query.limit) || 5, 20);

    const productsSnap = await db.collection('products')
      .where('sellerId', '==', sellerId)
      .get();

    const products = productsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Sort by revenue (currentPrice * sold). For ranking we use currentPrice when sold, else 0
    const ranked = products
      .map(p => ({
        id: p.id,
        title: p.title,
        image: (p.images && p.images[0]) || null,
        status: p.status,
        currentPrice: p.currentPrice || 0,
        startingPrice: p.startingPrice || 0,
        totalBids: p.totalBids || 0,
        views: p.views || 0,
        revenue: p.status === 'sold' ? (p.currentPrice || 0) : 0
      }))
      .sort((a, b) => b.revenue - a.revenue || b.totalBids - a.totalBids || b.views - a.views)
      .slice(0, limit);

    res.json({ success: true, data: ranked });
  } catch (error) {
    console.error('Seller top-products error:', error);
    res.status(500).json({ error: 'Failed to load top products' });
  }
});

// GET /api/seller/dashboard/overview — small summary used by the dashboard header
router.get('/dashboard/overview', authMiddleware, sellerMiddleware, async (req, res) => {
  try {
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    if (!userDoc.exists) return res.status(404).json({ error: 'User not found' });
    const user = userDoc.data();

    res.json({
      success: true,
      data: {
        businessName: user.sellerProfile?.businessName || user.businessName || user.username,
        slug: user.sellerProfile?.slug || req.user.uid,
        logoUrl: user.sellerProfile?.logoUrl || null,
        verifiedSeller: user.sellerProfile?.verifiedSeller === true,
        memberSinceAsSeller: user.sellerProfile?.memberSinceAsSeller || null,
        availableBalance: user.balance || 0,
        pendingBalance: user.pendingBalance || 0,
        heldBalance: user.heldBalance || 0,
        averageRating: user.sellerProfile?.averageRating || 0,
        ratingCount: user.sellerProfile?.ratingCount || 0
      }
    });
  } catch (error) {
    console.error('Seller overview error:', error);
    res.status(500).json({ error: 'Failed to load overview' });
  }
});

module.exports = router;
