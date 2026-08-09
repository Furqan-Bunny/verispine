const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');

// Helper: resolve a seller by slug OR userId
async function resolveSeller(slugOrUserId) {
  // Try slug first
  const bySlug = await db.collection('users')
    .where('sellerProfile.slug', '==', slugOrUserId)
    .limit(1)
    .get();
  if (!bySlug.empty) {
    const d = bySlug.docs[0];
    return { id: d.id, ...d.data() };
  }
  // Fall back to userId
  const byId = await db.collection('users').doc(slugOrUserId).get();
  if (byId.exists) {
    return { id: byId.id, ...byId.data() };
  }
  return null;
}

function publicSellerView(user) {
  if (!user) return null;
  const sp = user.sellerProfile || {};
  return {
    id: user.id,
    slug: sp.slug || user.id,
    businessName: sp.businessName || user.businessName || user.username || 'Seller',
    description: sp.description || '',
    logoUrl: sp.logoUrl || null,
    bannerUrl: sp.bannerUrl || null,
    contactEmail: sp.contactEmail || null,
    returnPolicy: sp.returnPolicy || '',
    shippingPolicy: sp.shippingPolicy || '',
    verifiedSeller: sp.verifiedSeller === true,
    memberSinceAsSeller: sp.memberSinceAsSeller || null,
    averageRating: sp.averageRating || 0,
    ratingCount: sp.ratingCount || 0,
    totalSales: sp.totalSales || 0,
    activeListings: sp.activeListings || 0
  };
}

// GET /api/sellers/:slugOrUserId — public seller profile
router.get('/:slugOrUserId', async (req, res) => {
  try {
    const seller = await resolveSeller(req.params.slugOrUserId);
    if (!seller) return res.status(404).json({ error: 'Seller not found' });

    // Only sellers/admins should be exposed publicly
    if (seller.role !== 'seller' && seller.role !== 'admin') {
      return res.status(404).json({ error: 'Seller not found' });
    }

    res.json({ success: true, data: publicSellerView(seller) });
  } catch (error) {
    console.error('Get seller error:', error);
    res.status(500).json({ error: 'Failed to load seller' });
  }
});

// GET /api/sellers/:slugOrUserId/products
router.get('/:slugOrUserId/products', async (req, res) => {
  try {
    const seller = await resolveSeller(req.params.slugOrUserId);
    if (!seller) return res.status(404).json({ error: 'Seller not found' });

    const status = req.query.status || 'active';

    let query = db.collection('products').where('sellerId', '==', seller.id);
    if (status && status !== 'all') {
      query = query.where('status', '==', status);
    }

    let snapshot;
    try {
      snapshot = await query.orderBy('createdAt', 'desc').get();
    } catch {
      snapshot = await query.get();
    }

    const products = [];
    snapshot.forEach(doc => products.push({ id: doc.id, ...doc.data() }));

    res.json({ success: true, data: products });
  } catch (error) {
    console.error('Get seller products error:', error);
    res.status(500).json({ error: 'Failed to load seller products' });
  }
});

// GET /api/sellers/:slugOrUserId/reviews
router.get('/:slugOrUserId/reviews', async (req, res) => {
  try {
    const seller = await resolveSeller(req.params.slugOrUserId);
    if (!seller) return res.status(404).json({ error: 'Seller not found' });

    const limit = Math.min(parseInt(req.query.limit) || 20, 50);

    let snapshot;
    try {
      snapshot = await db.collection('reviews')
        .where('sellerId', '==', seller.id)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();
    } catch {
      // Fallback if index missing
      snapshot = await db.collection('reviews')
        .where('sellerId', '==', seller.id)
        .limit(limit)
        .get();
    }

    const reviews = [];
    let sum = 0;
    let count = 0;
    snapshot.forEach(doc => {
      const r = doc.data();
      reviews.push({ id: doc.id, ...r });
      if (typeof r.rating === 'number') {
        sum += r.rating;
        count++;
      }
    });

    res.json({
      success: true,
      data: {
        reviews,
        averageRating: count > 0 ? sum / count : (seller.sellerProfile?.averageRating || 0),
        ratingCount: count
      }
    });
  } catch (error) {
    console.error('Get seller reviews error:', error);
    res.status(500).json({ error: 'Failed to load reviews' });
  }
});

module.exports = router;
