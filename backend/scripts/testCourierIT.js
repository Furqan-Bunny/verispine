/**
 * CourierIT (RTT Generic API v1.15) UAT test — booking + tracking.
 *
 * Uses the RTT_* values from backend/.env. Builds an AddInstructionV2 consignment from a synthetic
 * order using the real rttShippingService payload helpers (buildAddress/buildParcels), so this tests
 * exactly what production would send — WITHOUT touching Firestore.
 *
 *   node backend/scripts/testCourierIT.js            # DRY RUN: print the payload only, no API call
 *   node backend/scripts/testCourierIT.js --live     # POST to UAT: creates a real UAT consignment
 *   node backend/scripts/testCourierIT.js --live --track   # also poll GetBulkStatusDetail after booking
 *
 * On go-live, switch RTT_BASE_URL to https://api.rtt.co.za and use the PROD account/PIN.
 */
require('dotenv').config();
const axios = require('axios');
const rtt = require('../services/rttShippingService');

const LIVE = process.argv.includes('--live');
const TRACK = process.argv.includes('--track');

// A representative order (Cape Town seller -> Johannesburg buyer). Swap in real, RTT-serviceable
// addresses/postal codes for a meaningful UAT test.
const order = {
  id: `UATTEST${Date.now()}`,
  productId: 'uat-product',
  quantity: 1,
  weight: 2,
  productTitle: 'VeriSpine UAT Test Parcel',
  amount: 500,
  totalAmount: 550,
  shippingInfo: {
    fullName: 'Test Buyer',
    address: '10 Rissik Street',
    suburb: 'Johannesburg Central',
    city: 'Johannesburg',
    province: 'Gauteng',
    postalCode: '2001',
    phone: '0110000000',
    email: 'buyer@example.com',
  },
};
const product = { weight: 2, dimensions: { length: 30, width: 20, height: 10 } };
const seller = {
  businessName: 'VeriSpine Test Seller',
  phone: '0210000000',
  email: 'seller@example.com',
};
const pickup = {
  pickupAddress: '17 Woodlands Road',
  pickupSuburb: 'Woodstock',
  pickupCity: 'Cape Town',
  pickupProvince: 'Western Cape',
  pickupPostalCode: '7925',
};

function buildPayload() {
  const s = order.shippingInfo;
  const objPickupAddress = rtt.buildAddress({
    company: seller.businessName, street: pickup.pickupAddress, suburb: pickup.pickupSuburb,
    city: pickup.pickupCity, postalCode: pickup.pickupPostalCode,
    contactName: seller.businessName, phone: seller.phone, email: seller.email,
  });
  const objDeliveryAddress = rtt.buildAddress({
    company: s.fullName, street: s.address, suburb: s.suburb, city: s.city,
    postalCode: s.postalCode, contactName: s.fullName, phone: s.phone, email: s.email,
  });
  const declaredValue = Number(order.amount || 0);
  return {
    strAccountCode: rtt.accountCode,
    strPIN: rtt.pin,
    objPickupAddress,
    objDeliveryAddress,
    intServiceLevel: rtt.serviceLevel,
    aryCustomerReferenceNo: [{ intReferenceType: 'ORDER_NUMBER', strReferenceNo: String(order.id).slice(0, 20) }],
    strSpecialInstructions: '',
    aryParcels: rtt.buildParcels(order, product),
    weekendDelivery: false,
    lngInsuranceValue: declaredValue,
    booInsured: declaredValue > 0,
    dispatchDate: new Date().toISOString(),
    strStoreCode: '',
    strBranchCode: '',
    booIsCollection: false,
    intCollectionParcelCount: 0,
  };
}

function redact(p) {
  return { ...p, strPIN: '<redacted>' };
}

(async () => {
  console.log('=== CourierIT (RTT Generic API v1.15) UAT test ===');
  console.log('base URL      :', rtt.baseUrl);
  console.log('account       :', rtt.accountCode);
  console.log('serviceLevel  :', rtt.serviceLevel, '(844 = CTC)');
  console.log('barcode prefix:', rtt.barcodePrefix);
  console.log('mock mode     :', rtt.mock);
  console.log('mode          :', LIVE ? 'LIVE (will POST to UAT)' : 'DRY RUN (no API call)');

  if (!rtt.isConfigured()) {
    console.error('RTT is not configured — check RTT_ACCOUNT_CODE / RTT_PIN in .env');
    process.exit(1);
  }

  const payload = buildPayload();
  console.log('\n--- AddInstructionV2 payload ---');
  console.log(JSON.stringify(redact(payload), null, 2));

  if (!LIVE) {
    console.log('\nDry run only. Re-run with --live to create a real UAT consignment.');
    return;
  }

  const headers = { 'Content-Type': 'application/json', ...rtt.headers() };
  const url = `${rtt.baseUrl}/AddInstructionV2`;
  console.log('\nPOST', url);
  try {
    const res = await axios.post(url, payload, { headers, timeout: 30000 });
    const data = (res.data && (res.data.data || res.data)) || {};
    const rc = rtt.resultCode(data);
    console.log('HTTP', res.status, '| resultCode:', rc, '| message:', rtt.resultMessage(data));
    const waybill = rtt.extractWaybill(data);
    console.log('waybill/consignment:', waybill || '(none returned)');
    console.log('full response:', JSON.stringify(data, null, 2).slice(0, 2000));

    if (rc && rc !== 'R000') {
      console.error(`\n[!] CourierIT returned ${rc} — see RTT spec §7.1 return codes (e.g. R005 = invalid service level, R037/R040 = invalid street code).`);
    }

    if (TRACK && waybill) {
      console.log('\n--- GetBulkStatusDetail ---');
      const track = await rtt.trackOne(waybill);
      console.log(JSON.stringify(track, null, 2));
    }
  } catch (e) {
    console.error('Request failed:', e.response ? `HTTP ${e.response.status} ${JSON.stringify(e.response.data)}` : e.message);
    process.exit(1);
  }
})();
