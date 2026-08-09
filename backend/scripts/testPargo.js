/**
 * Pargo (Simba API) end-to-end test — auth -> pickup points -> quotation -> (optional) create + track.
 *
 * Uses PARGO_* from backend/.env. Set STAGING creds for testing:
 *   PARGO_BASE_URL=https://api.staging.pargo.co.za
 *   PARGO_USERNAME=<MyPargo account email>
 *   PARGO_PASSWORD=<password>
 *   PARGO_MAP_TOKEN=<map token>            (only needed for the checkout pickup-point map, not this test)
 *
 * Usage:
 *   node backend/scripts/testPargo.js                 # config check + connectivity plan (no create)
 *   node backend/scripts/testPargo.js --live          # auth + find a pickup point + get a QUOTATION (safe reads)
 *   node backend/scripts/testPargo.js --live --create # also CREATE a real W2P order + green-light + track
 *   node backend/scripts/testPargo.js --live --address "17 Woodlands Road, Cape Town, 7925"
 */
require('dotenv').config();
const axios = require('axios');
const pargo = require('../services/pargoShippingService');

const args = process.argv.slice(2);
const LIVE = args.includes('--live');
const CREATE = args.includes('--create');
const addrIdx = args.indexOf('--address');
const SEARCH_ADDRESS = addrIdx >= 0 ? args[addrIdx + 1] : '17 Woodlands Road, Woodstock, Cape Town, 7925';

const base = pargo.baseUrl; // from PARGO_BASE_URL (prod default). Set staging for testing.

// Synthetic buyer + parcel for the test.
const consignee = {
  firstName: 'Test', lastName: 'Buyer',
  email: 'buyer@example.com',
  phoneNumbers: ['+27210000000'],
};
const parcel = { length: 30, width: 20, height: 10 }; // cm
const deadWeight = 2;   // kg
const cubicWeight = Math.round((parcel.length * parcel.width * parcel.height) / 5000 * 1000) / 1000;

async function main() {
  console.log('=== Pargo (Simba API) test ===');
  console.log('base URL   :', base, base.includes('staging') ? '(staging)' : '(PROD — set PARGO_BASE_URL to staging for testing)');
  console.log('configured :', pargo.isConfigured(), '| username set:', !!pargo.username, '| password set:', !!pargo.password);
  console.log('mode       :', LIVE ? (CREATE ? 'LIVE + CREATE ORDER' : 'LIVE (reads only)') : 'DRY (config check only)');

  if (!pargo.username || !pargo.password) {
    console.error('\n[!] PARGO_USERNAME / PARGO_PASSWORD not set. Get the MyPargo account email + password and set them in backend/.env.');
    process.exit(1);
  }
  if (!LIVE) {
    console.log('\nConfig looks ready. Re-run with --live to auth + fetch a pickup point + get a quotation.');
    return;
  }

  const headers = async () => ({ 'Content-Type': 'application/json', ...(await pargo.authHeaders()) });

  // 1) AUTH
  console.log('\n[1] POST /auth ...');
  const token = await pargo.token();
  console.log('    OK — got bearer token (len', String(token).length + ')');

  // 2) PICKUP POINTS (by address)
  console.log('\n[2] GET /pickup_points ?address=', SEARCH_ADDRESS);
  const pp = await axios.get(`${base}/pickup_points`, {
    params: { address: SEARCH_ADDRESS, country: 'ZA', limit: 5, sort: 'distance+' },
    headers: await headers(), timeout: 30000,
  });
  const points = (pp.data && pp.data.data) || [];
  points.slice(0, 5).forEach((p, i) => {
    const a = p.attributes || p;
    console.log(`    ${i + 1}. ${a.pickupPointCode}  ${a.name || a.short_store_name || ''} — ${a.address1 || ''} ${a.suburb || ''} ${a.city || ''} ${a.postalCode || ''}`);
  });
  const point = points[0] && (points[0].attributes || points[0]);
  if (!point) { console.error('    [!] No pickup points returned for that address.'); process.exit(1); }
  const pickupPointCode = point.pickupPointCode;
  console.log('    -> using pickupPointCode:', pickupPointCode);

  // 3) QUOTATION (W2P)
  console.log('\n[3] POST /orders/quotation (W2P) ...');
  const quoteBody = { data: { type: 'W2P', attributes: {
    pickupPointCode, externalReference: `QS-TEST-${Date.now()}`,
    consignee, cubicWeight, deadWeight, parcels: [parcel],
  } } };
  try {
    const q = await axios.post(`${base}/orders/quotation`, quoteBody, { headers: await headers(), timeout: 30000 });
    const quote = q.data && q.data.data && q.data.data.attributes && q.data.data.attributes.quotation;
    console.log('    OK — price:', quote ? `$${quote.price}` : JSON.stringify(q.data).slice(0, 300));
  } catch (e) {
    console.error('    quotation error:', e.response ? `HTTP ${e.response.status} ${JSON.stringify(e.response.data).slice(0,300)}` : e.message);
  }

  if (!CREATE) {
    console.log('\nDone (reads only). Re-run with --create to also create a real W2P order + green-light + track.');
    return;
  }

  // 4) CREATE W2P ORDER (dynamic warehouse)
  console.log('\n[4] POST /orders (create W2P) ...');
  const externalReference = `QS-TEST-${Date.now()}`;
  const createBody = { data: { type: 'W2P', attributes: {
    externalReference,
    packageDescription: 'VeriSpine test parcel',
    pickupPointCode,
    cubicWeight, deadWeight,
    communications: { name: pargo.supportName, supportPhoneNumber: pargo.supportPhone, supportEmail: pargo.supportEmail },
    consignee,
    warehouseAddress: {
      companyName: 'VeriSpine Test Seller',
      address1: '17 Woodlands Road', address2: '',
      suburb: 'Woodstock', postalCode: '7925', city: 'Cape Town',
      country: 'ZA', province: 'Western Cape',
      contactName: 'VeriSpine Test Seller', email: pargo.supportEmail, phoneNumber: pargo.supportPhone,
    },
  } } };
  const created = await axios.post(`${base}/orders`, createBody, { headers: await headers(), timeout: 30000 });
  const cdata = (created.data && created.data.data) || created.data || {};
  const waybill = cdata.trackingCode || (cdata.attributes && cdata.attributes.trackingCode) || cdata.waybill;
  console.log('    OK — trackingCode/waybill:', waybill || JSON.stringify(cdata).slice(0, 300));

  // 5) GREEN-LIGHT (confirm)
  if (waybill) {
    console.log('\n[5] POST /orders/green-light ...');
    try {
      await axios.post(`${base}/orders/green-light`, { data: { orderReferences: [waybill] } }, { headers: await headers(), timeout: 30000 });
      console.log('    OK — confirmed');
    } catch (e) { console.warn('    green-light:', e.response ? `HTTP ${e.response.status}` : e.message, '(may auto-confirm)'); }

    // 6) TRACK
    console.log('\n[6] GET /events/orders/' + waybill + ' ...');
    try {
      const ev = await axios.get(`${base}/events/orders/${encodeURIComponent(waybill)}`, { headers: await headers(), timeout: 30000 });
      const events = (ev.data && ev.data.data && ev.data.data.events) || [];
      events.forEach(e => console.log(`    - ${e.code || ''} ${e.title || ''} (${e.date || ''}) -> ${pargo.mapStatus(`${e.code || ''} ${e.title || ''} ${e.description || ''}`)}`));
      if (!events.length) console.log('    (no events yet — brand new order)');
    } catch (e) { console.error('    track error:', e.response ? `HTTP ${e.response.status}` : e.message); }
  }

  console.log('\nDone.');
}

main().catch(e => {
  console.error('\n[FATAL]', e.response ? `HTTP ${e.response.status} ${JSON.stringify(e.response.data).slice(0,400)}` : e.message);
  process.exit(1);
});
