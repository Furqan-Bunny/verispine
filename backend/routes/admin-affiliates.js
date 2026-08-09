const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const {
  computeAffiliateSummary,
  computeReferralAggregates,
  isPaidOrder
} = require('../utils/affiliateCommission');

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

function affiliateName(u) {
  return (
    u.displayName ||
    `${u.firstName || ''} ${u.lastName || ''}`.trim() ||
    u.username ||
    u.email ||
    'Unknown'
  );
}

// Per-affiliate KPI bundle (referral activity + commission summary).
async function enrichAffiliate(u) {
  const [refAgg, summary] = await Promise.all([
    computeReferralAggregates(u.id),
    computeAffiliateSummary(u.id)
  ]);
  return {
    id: u.id,
    name: affiliateName(u),
    email: u.email || null,
    kycStatus: u.kycStatus || 'NOT_SUBMITTED',
    affiliateActivatedAt: u.affiliateActivatedAt || u.createdAt || null,
    balance: Number(u.balance || 0),
    pendingBalance: Number(u.pendingBalance || 0),
    referredUsersCount: refAgg.referredUsersCount,
    referralPurchases: refAgg.referralPurchases,
    grossReferralSales: refAgg.grossReferralSales,
    totalEarned: summary.totalEarned,
    pendingCommission: summary.pendingCommission,
    owedFromReversals: summary.owedFromReversals
  };
}

// GET /api/admin/affiliates — paginated list with KPIs + platform-wide totals
router.get('/', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const {
      search = '',
      sortBy = 'earnings',
      page = '1',
      limit = '20'
    } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const pageSize = Math.min(100, Math.max(1, parseInt(limit)));

    const snap = await db.collection('users').where('isAffiliate', '==', true).get();
    let affiliates = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (search) {
      const s = String(search).toLowerCase();
      affiliates = affiliates.filter(u =>
        affiliateName(u).toLowerCase().includes(s) ||
        (u.email || '').toLowerCase().includes(s)
      );
    }

    const enriched = await Promise.all(affiliates.map(enrichAffiliate));

    // Platform-wide totals (across the full filtered set, not just the current page).
    const totals = enriched.reduce((acc, a) => {
      acc.totalPaidOut += a.totalEarned;
      acc.totalPending += a.pendingCommission;
      acc.totalReferralSales += a.grossReferralSales;
      acc.totalReferredUsers += a.referredUsersCount;
      acc.totalOwed += a.owedFromReversals;
      return acc;
    }, { totalPaidOut: 0, totalPending: 0, totalReferralSales: 0, totalReferredUsers: 0, totalOwed: 0, affiliateCount: enriched.length });

    const sorters = {
      earnings: (a, b) => b.totalEarned - a.totalEarned,
      pending: (a, b) => b.pendingCommission - a.pendingCommission,
      referrals: (a, b) => b.referredUsersCount - a.referredUsersCount,
      sales: (a, b) => b.grossReferralSales - a.grossReferralSales,
      activated: (a, b) => (toDate(b.affiliateActivatedAt)?.getTime() || 0) - (toDate(a.affiliateActivatedAt)?.getTime() || 0)
    };
    enriched.sort(sorters[sortBy] || sorters.earnings);

    const total = enriched.length;
    const start = (pageNum - 1) * pageSize;
    const paged = enriched.slice(start, start + pageSize);

    res.json({
      success: true,
      data: paged,
      totals,
      pagination: { total, page: pageNum, limit: pageSize, totalPages: Math.ceil(total / pageSize) }
    });
  } catch (error) {
    console.error('Admin list affiliates error:', error);
    res.status(500).json({ error: 'Failed to list affiliates' });
  }
});

// GET /api/admin/affiliates/:id — full profile
router.get('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const userDoc = await db.collection('users').doc(req.params.id).get();
    if (!userDoc.exists) return res.status(404).json({ error: 'Affiliate not found' });
    const u = { id: userDoc.id, ...userDoc.data() };

    const base = await enrichAffiliate(u);

    res.json({
      success: true,
      data: {
        ...base,
        phone: u.phone || null,
        firstName: u.firstName || null,
        lastName: u.lastName || null,
        displayName: u.displayName || u.username || null,
        createdAt: u.createdAt || null,
        lastLoginAt: u.lastLoginAt || null,
        isAffiliate: u.isAffiliate === true,
        totalReferrals: u.totalReferrals || 0
      }
    });
  } catch (error) {
    console.error('Admin get affiliate error:', error);
    res.status(500).json({ error: 'Failed to load affiliate' });
  }
});

// GET /api/admin/affiliates/:id/referrals — referred users + their activity (admin sees full email)
router.get('/:id/referrals', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const affiliateId = req.params.id;

    const usersSnap = await db.collection('users').where('referredBy', '==', affiliateId).get();
    const referred = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const referredIds = referred.map(u => u.id);

    const commissionByUser = {};
    try {
      const commSnap = await db.collection('affiliateCommissions').where('referrerId', '==', affiliateId).get();
      commSnap.forEach(doc => {
        const c = doc.data();
        if (c.status === 'reversed') return;
        commissionByUser[c.referredUserId] = (commissionByUser[c.referredUserId] || 0) + Number(c.commissionAmount || 0);
      });
    } catch (e) { console.error('admin referrals: commission fetch failed', e); }

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
      userId: u.id,
      name: affiliateName(u),
      email: u.email || null,
      signupDate: u.createdAt || null,
      type: u.referralCode ? 'invite' : 'direct',
      purchaseCount: purchasesByUser[u.id] || 0,
      totalSpent: spentByUser[u.id] || 0,
      commissionGenerated: commissionByUser[u.id] || 0
    }));

    rows.sort((a, b) => b.commissionGenerated - a.commissionGenerated);

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Admin affiliate referrals error:', error);
    res.status(500).json({ error: 'Failed to load referrals' });
  }
});

// GET /api/admin/affiliates/:id/commissions — order-level commission ledger
router.get('/:id/commissions', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const snap = await db.collection('affiliateCommissions')
      .where('referrerId', '==', req.params.id)
      .get();
    const rows = snap.docs.map(d => {
      const c = d.data();
      return {
        id: d.id,
        orderId: c.orderId || null,
        referredUserId: c.referredUserId || null,
        purchaseAmount: Number(c.purchaseAmount || 0),
        commissionAmount: Number(c.commissionAmount || 0),
        status: c.status || 'pending',
        createdAt: c.createdAt || null,
        releasedAt: c.releasedAt || null,
        reversedAt: c.reversedAt || null
      };
    });
    rows.sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0));
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Admin affiliate commissions error:', error);
    res.status(500).json({ error: 'Failed to load commissions' });
  }
});

// GET /api/admin/affiliates/:id/timeseries — commission generated/released per day
router.get('/:id/timeseries', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { period = '30d', from, to } = req.query;

    // Custom range (from/to) takes precedence over the preset period. Falls back to
    // the preset if either date is missing/invalid or the range is inverted.
    let start = periodStart(period);
    let end = new Date();
    let usedCustom = false;
    if (from && to) {
      const s = new Date(from);
      const e = new Date(to);
      if (!isNaN(s.getTime()) && !isNaN(e.getTime()) && s <= e) {
        start = s;
        end = e;
        usedCustom = true;
      }
    }
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    // Cap the number of daily buckets to keep the response bounded (~2 years).
    const MAX_DAYS = 732;
    if ((end - start) / 86400000 > MAX_DAYS) {
      start = new Date(end.getTime() - MAX_DAYS * 86400000);
      start.setHours(0, 0, 0, 0);
    }

    const snap = await db.collection('affiliateCommissions')
      .where('referrerId', '==', req.params.id)
      .get();

    const buckets = {};
    const cursor = new Date(start);
    while (cursor <= end) {
      const key = cursor.toISOString().slice(0, 10);
      buckets[key] = { date: key, commission: 0, released: 0 };
      cursor.setDate(cursor.getDate() + 1);
    }

    // Commission buckets + range-scoped commission totals (by createdAt).
    let earnedInRange = 0;   // credited commission created in range
    let pendingInRange = 0;  // pending commission created in range
    snap.forEach(doc => {
      const c = doc.data();
      if (c.status === 'reversed') return;
      const t = toDate(c.createdAt);
      if (!t || t < start || t > end) return;
      const key = t.toISOString().slice(0, 10);
      if (!buckets[key]) buckets[key] = { date: key, commission: 0, released: 0 };
      const amt = Number(c.commissionAmount || 0);
      buckets[key].commission += amt;
      if (c.status === 'credited') { buckets[key].released += amt; earnedInRange += amt; }
      else if (c.status === 'pending') pendingInRange += amt;
    });

    // Referred users who signed up in this range + their paid purchases in this range.
    const referredSnap = await db.collection('users').where('referredBy', '==', req.params.id).get();
    const referredIds = referredSnap.docs.map(d => d.id);
    let referredUsersInRange = 0;
    referredSnap.forEach(d => {
      const t = toDate(d.data().createdAt);
      if (t && t >= start && t <= end) referredUsersInRange++;
    });

    let referralPurchasesInRange = 0;
    let grossReferralSalesInRange = 0;
    for (let i = 0; i < referredIds.length; i += 30) {
      const chunk = referredIds.slice(i, i + 30);
      if (!chunk.length) break;
      const ordersSnap = await db.collection('orders').where('buyerId', 'in', chunk).get();
      ordersSnap.forEach(doc => {
        const o = doc.data();
        if (!isPaidOrder(o)) return;
        const t = toDate(o.createdAt);
        if (!t || t < start || t > end) return;
        referralPurchasesInRange++;
        grossReferralSalesInRange += parseFloat(o.amount) || 0;
      });
    }

    const series = Object.values(buckets);
    res.json({
      success: true,
      data: {
        period: usedCustom ? 'custom' : period,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        series,
        totals: {
          commission: series.reduce((s, x) => s + x.commission, 0),
          released: series.reduce((s, x) => s + x.released, 0),
          earned: earnedInRange,
          pending: pendingInRange,
          referredUsers: referredUsersInRange,
          referralPurchases: referralPurchasesInRange,
          grossReferralSales: grossReferralSalesInRange
        }
      }
    });
  } catch (error) {
    console.error('Admin affiliate timeseries error:', error);
    res.status(500).json({ error: 'Failed to load timeseries' });
  }
});

// GET /api/admin/affiliates/:id/activity — derived timeline
router.get('/:id/activity', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const affiliateId = req.params.id;
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));

    const [userDoc, referredSnap, commSnap] = await Promise.all([
      db.collection('users').doc(affiliateId).get(),
      db.collection('users').where('referredBy', '==', affiliateId).get(),
      db.collection('affiliateCommissions').where('referrerId', '==', affiliateId).get()
    ]);

    const events = [];

    if (userDoc.exists) {
      const u = userDoc.data();
      const activatedAt = toDate(u.affiliateActivatedAt);
      if (activatedAt) {
        events.push({ type: 'became_affiliate', title: 'Activated affiliate program', detail: null, timestamp: activatedAt.toISOString() });
      }
    }

    referredSnap.forEach(doc => {
      const r = doc.data();
      const t = toDate(r.createdAt);
      if (t) {
        events.push({
          type: 'referral_signed_up',
          title: `${r.firstName || r.email || 'A user'} signed up`,
          detail: r.referralCode ? 'via invitation' : 'via referral link',
          timestamp: t.toISOString()
        });
      }
    });

    commSnap.forEach(doc => {
      const c = doc.data();
      const amt = Number(c.commissionAmount || 0);
      const created = toDate(c.createdAt);
      if (created) {
        events.push({
          type: 'commission_pending',
          title: `Commission earned R${amt.toFixed(2)}`,
          detail: c.orderId ? `Order #${String(c.orderId).slice(0, 8)} (held until delivery)` : null,
          timestamp: created.toISOString()
        });
      }
      const released = toDate(c.releasedAt);
      if (released && c.status === 'credited') {
        events.push({
          type: 'commission_released',
          title: `Commission released R${amt.toFixed(2)}`,
          detail: c.orderId ? `Order #${String(c.orderId).slice(0, 8)} delivered` : null,
          timestamp: released.toISOString()
        });
      }
      const reversed = toDate(c.reversedAt);
      if (reversed && c.status === 'reversed') {
        events.push({
          type: 'commission_reversed',
          title: `Commission reversed R${amt.toFixed(2)}`,
          detail: c.orderId ? `Order #${String(c.orderId).slice(0, 8)} cancelled/refunded` : null,
          timestamp: reversed.toISOString()
        });
      }
    });

    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    res.json({ success: true, data: events.slice(0, limit), total: events.length });
  } catch (error) {
    console.error('Admin affiliate activity error:', error);
    res.status(500).json({ error: 'Failed to load activity' });
  }
});

module.exports = router;
