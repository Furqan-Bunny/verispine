/**
 * In-memory QA for the fixed-price stock model (limited vs unlimited "always available").
 * No network: mocks the Firestore transaction and asserts finalizeProductAfterPurchase()
 * behaves correctly for every branch + edge case.
 *
 * Run: node backend/scripts/testStockOptions.js
 */
const assert = require('assert');

// Mock backend/config/firebase BEFORE requiring the unit under test, so this runs
// fully offline (no Admin SDK init / credentials). finalizeProductAfterPurchase only
// needs admin.firestore.FieldValue.serverTimestamp(), so a sentinel is enough.
const fbPath = require.resolve('../config/firebase');
require.cache[fbPath] = {
  id: fbPath, filename: fbPath, loaded: true, exports: {
    admin: { firestore: { FieldValue: { serverTimestamp: () => '<<serverTimestamp>>' } } },
  },
};

const { finalizeProductAfterPurchase } = require('../utils/productPurchase');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}\n      ${e.message}`); }
}

// Mock transaction that records the single update() it receives.
function makeTxn() {
  return { last: null, update(_ref, data) { this.last = data; } };
}
const REF = { id: 'p1' };

console.log('\n=== Stock model QA: finalizeProductAfterPurchase ===\n');

// --- Limited stock --------------------------------------------------------
console.log('Limited stock:');

test('partial sale increments soldQuantity, stays active', () => {
  const txn = makeTxn();
  const r = finalizeProductAfterPurchase(txn, REF,
    { listingType: 'sale', stockType: 'limited', quantity: 10, soldQuantity: 0 },
    { quantity: 3 });
  assert.strictEqual(txn.last.soldQuantity, 3);
  assert.strictEqual(txn.last.status, undefined, 'should NOT close while stock remains');
  assert.strictEqual(r.soldOut, false);
});

test('selling the last units flips status to sold', () => {
  const txn = makeTxn();
  const r = finalizeProductAfterPurchase(txn, REF,
    { listingType: 'sale', stockType: 'limited', quantity: 10, soldQuantity: 7 },
    { quantity: 3 });
  assert.strictEqual(txn.last.soldQuantity, 10);
  assert.strictEqual(txn.last.status, 'sold');
  assert.ok(txn.last.soldAt, 'soldAt should be stamped');
  assert.strictEqual(r.soldOut, true);
});

test('oversell throws OUT_OF_STOCK with remaining count (no write)', () => {
  const txn = makeTxn();
  let err;
  try {
    finalizeProductAfterPurchase(txn, REF,
      { listingType: 'sale', stockType: 'limited', quantity: 10, soldQuantity: 8 },
      { quantity: 3 });
  } catch (e) { err = e; }
  assert.ok(err, 'should throw');
  assert.strictEqual(err.code, 'OUT_OF_STOCK');
  assert.strictEqual(err.remaining, 2);
  assert.strictEqual(txn.last, null, 'must not write on oversell (tx aborts)');
});

test('legacy sale with no stockType defaults to limited behaviour', () => {
  const txn = makeTxn();
  finalizeProductAfterPurchase(txn, REF,
    { listingType: 'sale', quantity: 5, soldQuantity: 4 },
    { quantity: 1 });
  assert.strictEqual(txn.last.soldQuantity, 5);
  assert.strictEqual(txn.last.status, 'sold');
});

// --- Unlimited ("always available") --------------------------------------
console.log('\nUnlimited (always available):');

test('counts the sale but never closes (quantity null)', () => {
  const txn = makeTxn();
  const r = finalizeProductAfterPurchase(txn, REF,
    { listingType: 'sale', stockType: 'unlimited', quantity: null, soldQuantity: 0 },
    { quantity: 5 });
  assert.strictEqual(txn.last.soldQuantity, 5);
  assert.strictEqual(txn.last.status, undefined, 'must never auto-close');
  assert.strictEqual(r.soldOut, false);
});

test('keeps selling far beyond any number, never throws', () => {
  const txn = makeTxn();
  const r = finalizeProductAfterPurchase(txn, REF,
    { listingType: 'sale', stockType: 'unlimited', quantity: null, soldQuantity: 100 },
    { quantity: 50 });
  assert.strictEqual(txn.last.soldQuantity, 150);
  assert.strictEqual(txn.last.status, undefined);
  assert.strictEqual(r.soldOut, false);
});

test('defaults order quantity to 1 when missing', () => {
  const txn = makeTxn();
  finalizeProductAfterPurchase(txn, REF,
    { listingType: 'sale', stockType: 'unlimited', soldQuantity: 9 }, {});
  assert.strictEqual(txn.last.soldQuantity, 10);
});

// --- Auction / single-item ------------------------------------------------
console.log('\nAuction / buy_now (single item):');

test('marks product sold with buyer + price', () => {
  const txn = makeTxn();
  const r = finalizeProductAfterPurchase(txn, REF,
    { listingType: 'auction' },
    { buyerId: 'u9', amount: 250 });
  assert.strictEqual(txn.last.status, 'sold');
  assert.strictEqual(txn.last.soldTo, 'u9');
  assert.strictEqual(txn.last.soldPrice, 250);
  assert.strictEqual(r.soldOut, true);
});

test('missing listingType is treated as auction (single item)', () => {
  const txn = makeTxn();
  finalizeProductAfterPurchase(txn, REF, {}, { buyerId: 'u1' });
  assert.strictEqual(txn.last.status, 'sold');
});

// --- Summary --------------------------------------------------------------
console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
process.exit(failed ? 1 : 0);
