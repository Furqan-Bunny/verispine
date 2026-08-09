/**
 * Isolated test for the affiliate commission lifecycle (gate → pending → release → reverse).
 * In-memory Firestore stub with runTransaction support — NO network, NO real data.
 * Run: node scripts/testAffiliateCommission.js
 */
const path = require('path');

const store = {};
let auto = 1;
const docRef = (col, id) => ({
  id, _col: col, _id: id,
  async get() { const d = store[`${col}/${id}`]; return { exists: d !== undefined, id, data: () => d, ref: docRef(col, id) }; },
  async set(data, opts) { store[`${col}/${id}`] = opts && opts.merge ? { ...(store[`${col}/${id}`] || {}), ...data } : { ...data }; },
  async update(data) { store[`${col}/${id}`] = { ...(store[`${col}/${id}`] || {}), ...data }; },
});
function collection(col) {
  const filters = [];
  const api = {
    where(f, _op, v) { filters.push([f, v]); return api; },
    limit() { return api; },
    async get() {
      const docs = Object.keys(store).filter(k => k.startsWith(col + '/'))
        .map(k => { const id = k.slice(col.length + 1); return { id, data: () => store[k], ref: docRef(col, id) }; })
        .filter(d => filters.every(([f, v]) => d.data()[f] === v));
      return { empty: docs.length === 0, size: docs.length, docs, forEach: fn => docs.forEach(fn) };
    },
    doc(id) { return docRef(col, id || `auto_${auto++}`); },
  };
  return api;
}
const db = {
  collection,
  async runTransaction(fn) {
    const tx = {
      async get(ref) { return ref.get(); },
      set(ref, data) { store[`${ref._col}/${ref._id}`] = { ...data }; },
      update(ref, data) { store[`${ref._col}/${ref._id}`] = { ...(store[`${ref._col}/${ref._id}`] || {}), ...data }; },
    };
    return fn(tx);
  },
};
const admin = { firestore: { FieldValue: { serverTimestamp: () => '__ts__', increment: n => ({ __inc: n }), delete: () => '__del__', arrayUnion: x => ({ __au: x }) } } };
const fbPath = require.resolve(path.join(__dirname, '..', 'config', 'firebase'));
require.cache[fbPath] = { id: fbPath, filename: fbPath, loaded: true, exports: { admin, db, auth: null, storage: null } };

const {
  processAffiliateCommission, releaseAffiliateCommissionForOrder, reverseAffiliateCommissionForOrder,
} = require('../utils/affiliateCommission');

const num = (col, id, field) => Number((store[`${col}/${id}`] || {})[field] || 0);
const commissionsFor = (orderId) => Object.keys(store).filter(k => k.startsWith('affiliateCommissions/')).map(k => store[k]).filter(c => c.orderId === orderId);
const txCount = (type) => Object.keys(store).filter(k => k.startsWith('transactions/')).filter(k => store[k].type === type).length;

(async () => {
  let pass = 0, fail = 0;
  const check = (n, c, extra) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n, extra !== undefined ? `(got ${JSON.stringify(extra)})` : ''); } };

  store['users/REF'] = { isAffiliate: false, balance: 0, pendingBalance: 0 };
  store['users/BUYER'] = { referredBy: 'REF' };

  console.log('\n[1] Gate: referrer is NOT an active affiliate → no commission');
  const r0 = await processAffiliateCommission('BUYER', 'ORD1', 1000);
  check('returns commission 0', r0.commission === 0, r0);
  check('pendingBalance untouched', num('users', 'REF', 'pendingBalance') === 0);
  check('no commission doc created', commissionsFor('ORD1').length === 0);

  console.log('\n[2] Activated affiliate → commission held as PENDING');
  store['users/REF'].isAffiliate = true;
  const r1 = await processAffiliateCommission('BUYER', 'ORD1', 1000);
  check('returns 5% = 50, status pending', r1.commission === 50 && r1.status === 'pending', r1);
  check('pendingBalance = 50', num('users', 'REF', 'pendingBalance') === 50, num('users', 'REF', 'pendingBalance'));
  check('balance still 0 (not spendable yet)', num('users', 'REF', 'balance') === 0);
  check('commission doc status = pending', commissionsFor('ORD1')[0] && commissionsFor('ORD1')[0].status === 'pending');
  check('no spendable transaction yet', txCount('affiliate_commission') === 0);

  console.log('\n[2b] Idempotent: same order does not double-charge');
  const r1b = await processAffiliateCommission('BUYER', 'ORD1', 1000);
  check('second call commission 0 (already processed)', r1b.commission === 0, r1b);
  check('pendingBalance still 50', num('users', 'REF', 'pendingBalance') === 50);

  console.log('\n[3] Release on delivery → pending → spendable balance');
  await releaseAffiliateCommissionForOrder('ORD1');
  check('pendingBalance = 0', num('users', 'REF', 'pendingBalance') === 0, num('users', 'REF', 'pendingBalance'));
  check('balance = 50 (now withdrawable)', num('users', 'REF', 'balance') === 50, num('users', 'REF', 'balance'));
  check('commission doc status = credited', commissionsFor('ORD1')[0].status === 'credited');
  check('spendable transaction written', txCount('affiliate_commission') === 1);

  console.log('\n[4] Reverse a still-pending commission (cancel before delivery)');
  await processAffiliateCommission('BUYER', 'ORD2', 2000); // 100 pending
  check('ORD2 pending = 100 total pendingBalance', num('users', 'REF', 'pendingBalance') === 100);
  await reverseAffiliateCommissionForOrder('ORD2');
  check('pendingBalance back to 0', num('users', 'REF', 'pendingBalance') === 0, num('users', 'REF', 'pendingBalance'));
  check('ORD2 commission status = reversed', commissionsFor('ORD2')[0].status === 'reversed');

  console.log('\n[5] Reverse an already-released commission (refund after delivery → clawback)');
  await reverseAffiliateCommissionForOrder('ORD1');
  check('balance clawed back to 0', num('users', 'REF', 'balance') === 0, num('users', 'REF', 'balance'));
  check('ORD1 commission status = reversed', commissionsFor('ORD1')[0].status === 'reversed');
  check('reversal audit transaction written', txCount('affiliate_commission_reversal') >= 1);

  console.log('\n[6] Clawback when balance is insufficient → clamp at 0, record owedFromReversals');
  await processAffiliateCommission('BUYER', 'ORD3', 1000); // 50 pending
  await releaseAffiliateCommissionForOrder('ORD3');        // balance 50
  check('balance = 50 after release', num('users', 'REF', 'balance') === 50, num('users', 'REF', 'balance'));
  store['users/REF'].balance = 10; // simulate referrer spent/withdrew most of it
  await reverseAffiliateCommissionForOrder('ORD3');        // claw back 50 from balance of 10
  check('balance clamped at 0 (never negative)', num('users', 'REF', 'balance') === 0, num('users', 'REF', 'balance'));
  check('owedFromReversals = 40 (shortfall tracked)', num('users', 'REF', 'owedFromReversals') === 40, num('users', 'REF', 'owedFromReversals'));

  console.log('\n[7] Next release settles outstanding debt first, only remainder is spendable');
  await processAffiliateCommission('BUYER', 'ORD4', 2000); // 100 pending
  await releaseAffiliateCommissionForOrder('ORD4');        // settle 40 owed, credit 60
  check('owedFromReversals settled to 0', num('users', 'REF', 'owedFromReversals') === 0, num('users', 'REF', 'owedFromReversals'));
  check('balance = 60 (100 commission − 40 debt)', num('users', 'REF', 'balance') === 60, num('users', 'REF', 'balance'));

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(1); });
