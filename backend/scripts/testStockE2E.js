/**
 * Live integration QA for the stock model against the running backend (localhost:5000).
 * Creates two clearly-labelled [QA] sale products (one unlimited, one limited), exercises the
 * order-creation stock branch + the out-of-stock status toggle via the REAL routes, then deletes
 * the test products. No orders are ever created (each attempt is stopped at/after the stock check
 * with a deliberately-wrong amount), so cleanup = delete the 2 products.
 *
 * Run with the dev server up:  node backend/scripts/testStockE2E.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const axios = require('axios');
const jwt = require('jsonwebtoken');
const { db } = require('../config/firebase');

const API = 'http://localhost:5000';
let passed = 0, failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`); }
};

const tok = (userId) => jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '1h' });

async function firstUser(role) {
  const snap = await db.collection('users').where('role', '==', role).limit(1).get();
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}

// POST /api/orders with valid shipping + a (usually wrong) amount; auto-retry on city restriction
// using the productCity the API hands back, so we always reach the stock/amount checks.
async function orderAttempt(buyerToken, productId, quantity, amount, city = 'Cape Town') {
  const body = (c) => ({
    productId, type: 'sale', amount, quantity, paymentMethod: 'wallet',
    shippingInfo: {
      fullName: 'QA Buyer', email: 'qa.buyer@example.com', phoneNumber: '0820000000',
      address: '2 Buyer Street', city: c, province: 'Western Cape', postalCode: '8001',
    },
  });
  const send = (c) => axios.post(`${API}/api/orders`, body(c), {
    headers: { Authorization: `Bearer ${buyerToken}` }, validateStatus: () => true,
  });
  let r = await send(city);
  if (r.status === 403 && r.data && r.data.cityRestricted && r.data.productCity) {
    r = await send(r.data.productCity); // retry matching the product's city
  }
  return r;
}

async function createSaleProduct(sellerToken, { stockType, quantity, name, categoryId }) {
  const shipping = JSON.stringify({
    cost: 0, location: 'Cape Town', pickupAddress: '1 Test Road', pickupCity: 'Cape Town',
    pickupProvince: 'Western Cape', pickupPostalCode: '8001', methods: ['Standard'],
  });
  const body = {
    title: `[QA] ${stockType} ${Date.now()}`, description: 'QA stock test product — safe to delete',
    category: name, categoryId, listingType: 'sale', price: 10, stockType, weight: 0.1,
    condition: 'new', shipping,
  };
  if (stockType === 'limited') body.quantity = quantity;
  const r = await axios.post(`${API}/api/products`, body, {
    headers: { Authorization: `Bearer ${sellerToken}` }, validateStatus: () => true,
  });
  return r;
}

async function main() {
  console.log('\n=== Stock model LIVE integration QA (localhost:5000) ===\n');
  const created = [];
  try {
    const seller = await firstUser('seller');
    let buyer = await firstUser('user');
    if (!seller) throw new Error('No seller user found in Firestore');
    if (!buyer || buyer.id === seller.id) throw new Error('No distinct buyer user found');
    const catSnap = await db.collection('categories').limit(1).get();
    if (catSnap.empty) throw new Error('No categories found');
    const cat = { id: catSnap.docs[0].id, ...catSnap.docs[0].data() };
    console.log(`seller=${seller.id} buyer=${buyer.id} category=${cat.name}\n`);

    const sellerToken = tok(seller.id);
    const buyerToken = tok(buyer.id);

    // --- create ---
    console.log('Create:');
    const uRes = await createSaleProduct(sellerToken, { stockType: 'unlimited', name: cat.name, categoryId: cat.id });
    ok('create unlimited product → 200/201', [200, 201].includes(uRes.status), `status ${uRes.status} ${JSON.stringify(uRes.data).slice(0,200)}`);
    const unlimitedId = uRes.data?.data?.id || uRes.data?.id || uRes.data?.productId;
    if (unlimitedId) created.push(unlimitedId);

    const lRes = await createSaleProduct(sellerToken, { stockType: 'limited', quantity: 2, name: cat.name, categoryId: cat.id });
    ok('create limited product (qty 2) → 200/201', [200, 201].includes(lRes.status), `status ${lRes.status}`);
    const limitedId = lRes.data?.data?.id || lRes.data?.id || lRes.data?.productId;
    if (limitedId) created.push(limitedId);

    // --- stored shape ---
    console.log('\nStored shape:');
    const got = await axios.get(`${API}/api/products/${unlimitedId}`, { validateStatus: () => true });
    const p = got.data?.data || got.data;
    ok('unlimited: stockType === "unlimited"', p?.stockType === 'unlimited', `got ${p?.stockType}`);
    ok('unlimited: quantity is null', p?.quantity === null || p?.quantity === undefined, `got ${p?.quantity}`);
    ok('unlimited: soldQuantity === 0', Number(p?.soldQuantity) === 0, `got ${p?.soldQuantity}`);
    ok('unlimited: status active', p?.status === 'active', `got ${p?.status}`);

    // --- order-creation stock branch (no order is created: wrong amount stops it past the stock check) ---
    console.log('\nOrder validation (stock branch):');
    // Unlimited + huge qty + wrong amount → must NOT be the stock error; should reach amount check.
    let r = await orderAttempt(buyerToken, unlimitedId, 100, 1);
    const msg = (r.data && r.data.error) || '';
    ok('unlimited bypasses stock check (no "left in stock")', !/left in stock/i.test(msg), `status ${r.status} msg="${msg}"`);
    ok('unlimited reaches amount check (proves stock passed)', /invalid purchase amount/i.test(msg), `status ${r.status} msg="${msg}"`);

    // Limited control + qty over stock → must be the stock error.
    r = await orderAttempt(buyerToken, limitedId, 5, 50);
    ok('limited still enforces stock ("left in stock")', /left in stock/i.test((r.data && r.data.error) || ''), `status ${r.status} msg="${(r.data&&r.data.error)||''}"`);

    // --- out-of-stock toggle ---
    console.log('\nMark out of stock / back in stock:');
    await axios.put(`${API}/api/products/${unlimitedId}`, { status: 'sold' }, { headers: { Authorization: `Bearer ${sellerToken}` }, validateStatus: () => true });
    r = await orderAttempt(buyerToken, unlimitedId, 1, 1);
    ok('out-of-stock unlimited blocks purchase ("no longer available")', /no longer available/i.test((r.data && r.data.error) || ''), `status ${r.status} msg="${(r.data&&r.data.error)||''}"`);

    await axios.put(`${API}/api/products/${unlimitedId}`, { status: 'active' }, { headers: { Authorization: `Bearer ${sellerToken}` }, validateStatus: () => true });
    r = await orderAttempt(buyerToken, unlimitedId, 1, 1);
    ok('back-in-stock unlimited allows purchase again (reaches amount check)', /invalid purchase amount/i.test((r.data && r.data.error) || ''), `status ${r.status} msg="${(r.data&&r.data.error)||''}"`);

    // --- cleanup ---
    console.log('\nCleanup:');
    for (const id of created) {
      const d = await axios.delete(`${API}/api/products/${id}`, { headers: { Authorization: `Bearer ${sellerToken}` }, validateStatus: () => true });
      ok(`deleted test product ${id}`, [200, 204].includes(d.status), `status ${d.status}`);
    }
  } catch (e) {
    failed++;
    console.log('  ✗ FATAL:', e.message);
    // best-effort cleanup of anything created before the failure
    for (const id of created) { try { await db.collection('products').doc(id).delete(); } catch {} }
  }

  console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed ? 1 : 0);
}

main();
