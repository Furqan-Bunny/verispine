/**
 * Isolated test for the SAPO/ShipLogic provider toggle in MOCK mode.
 * Uses an in-memory Firestore stub injected into require.cache, so it makes
 * NO network calls and touches NO real data. Run: node scripts/testShippingToggle.js
 */
process.env.SHIPLOGIC_MOCK_MODE = 'true';
process.env.SAPO_MOCK_MODE = 'true';

const path = require('path');

// ---- in-memory Firebase stub (injected before anything requires config/firebase) ----
const store = {};
const k = (c, id) => `${c}/${id}`;
function docRef(col, id) {
  const ref = {
    id,
    async get() { const d = store[k(col, id)]; return { exists: d !== undefined, id, data: () => d, ref }; },
    async set(data, opts) { const prev = store[k(col, id)] || {}; store[k(col, id)] = opts && opts.merge ? { ...prev, ...data } : data; },
    async update(data) { store[k(col, id)] = { ...(store[k(col, id)] || {}), ...data }; },
  };
  return ref;
}
function collection(col) {
  const filters = [];
  const q = {
    where(f, _op, v) { filters.push([f, v]); return q; },
    limit() { return q; },
    async get() {
      const docs = Object.keys(store)
        .filter(key => key.startsWith(col + '/'))
        .map(key => ({ id: key.split('/')[1], data: () => store[key], ref: docRef(col, key.split('/')[1]) }))
        .filter(d => filters.every(([f, v]) => d.data()[f] === v));
      return { empty: docs.length === 0, docs };
    },
    doc(id) { return docRef(col, id); },
  };
  return q;
}
const admin = { firestore: { FieldValue: {
  serverTimestamp: () => '__ts__', arrayUnion: (x) => ({ __arrayUnion: x }), delete: () => '__delete__',
} } };
const fbPath = require.resolve(path.join(__dirname, '..', 'config', 'firebase'));
require.cache[fbPath] = { id: fbPath, filename: fbPath, loaded: true, exports: { admin, db: { collection }, auth: null, storage: null } };

// ---- modules under test ----
const shippingSettings = require('../utils/shippingSettings');
const shipping = require('../services/shippingService');

const order = {
  id: 'TESTORDER1', productId: 'P1', buyerId: 'B1', sellerId: 'S1',
  productTitle: 'Test Widget', amount: 500, weight: 2,
  shippingInfo: { fullName: 'Jane Buyer', address: '10 Main St', city: 'Cape Town', province: 'Western Cape', postalCode: '8001', phone: '0820000000', email: 'jane@test.com' },
  pickup: { address: '1 Seller Rd', city: 'Pretoria', province: 'Gauteng', postalCode: '0181' },
  seller: { name: 'Seller Co', email: 'seller@test.com', phone: '0830000000' },
};

async function setProvider(p) {
  store['settings/shipping'] = { activeProvider: p };
  shippingSettings.clearShippingProviderCache();
}

(async () => {
  let pass = 0, fail = 0;
  const check = (name, cond, extra) => { if (cond) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗', name, extra !== undefined ? `(got: ${JSON.stringify(extra)})` : ''); } };

  store['products/P1'] = { weight: 2, dimensions: { length: 30, width: 20, height: 10 } };

  console.log('\n[1] Admin toggle = ShipLogic');
  await setProvider('shiplogic');
  check('isShipLogicActive() is true', (await shippingSettings.isShipLogicActive()) === true);
  const r1 = await shipping.createShipmentForOrder(order);
  check('createShipmentForOrder returns carrier ShipLogic', r1.carrier === 'ShipLogic', r1.carrier);
  check('mock tracking number starts with SL', /^SL/.test(r1.trackingNumber), r1.trackingNumber);
  check('shipments doc stored as ShipLogic', store['shipments/TESTORDER1'] && store['shipments/TESTORDER1'].carrier === 'ShipLogic', store['shipments/TESTORDER1'] && store['shipments/TESTORDER1'].carrier);

  console.log('\n[2] Admin toggle = SAPO');
  await setProvider('sapo');
  check('isShipLogicActive() is false', (await shippingSettings.isShipLogicActive()) === false);
  const r2 = await shipping.createShipmentForOrder(order);
  check('createShipmentForOrder returns carrier SAPO', r2.carrier === 'SAPO', r2.carrier);
  check('shipments doc re-stored as SAPO', store['shipments/TESTORDER1'].carrier === 'SAPO', store['shipments/TESTORDER1'].carrier);

  console.log('\n[3] Default (no setting) falls back to SAPO');
  delete store['settings/shipping'];
  shippingSettings.clearShippingProviderCache();
  check('getActiveShippingProvider() defaults to sapo', (await shippingSettings.getActiveShippingProvider()) === 'sapo');

  console.log('\n[4] Tracking dispatches by the shipment’s stored carrier (mixed fleet)');
  store['shipments/SLSHIP'] = { trackingNumber: 'SL999', carrier: 'ShipLogic', orderId: 'O-SL' };
  const t = await shipping.trackItems('SL999');
  check('trackItems stamps carrier = ShipLogic for an SL parcel', t.items[0] && t.items[0].carrier === 'ShipLogic', t.items[0] && t.items[0].carrier);

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(1); });
