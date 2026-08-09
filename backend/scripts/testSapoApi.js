// SAPO API end-to-end smoke test.
// Usage:
//   node backend/scripts/testSapoApi.js                 # uses backend/.env
//   NODE_ENV=production node backend/scripts/testSapoApi.js   # hits production URLs
//
// With NODE_ENV=production it will also read SAPO_* overrides from the command environment.

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const dns = require('dns').promises;
const sapo = require('../services/sapoShippingService');

const pretty = (label, ok, detail = '') => {
  const mark = ok ? 'OK  ' : 'FAIL';
  console.log(`[${mark}] ${label}${detail ? ' — ' + detail : ''}`);
};

(async () => {
  console.log('--- SAPO API smoke test ---');
  console.log('NODE_ENV          :', process.env.NODE_ENV || '(dev)');
  console.log('SAPO_MOCK_MODE    :', process.env.SAPO_MOCK_MODE || '(unset)');
  console.log('SAPO_API_TOKEN    :', (process.env.SAPO_API_TOKEN || '').slice(0, 8) + '...');
  console.log('SAPO_TRN_TOKEN    :', (process.env.SAPO_TRN_TOKEN || '').slice(0, 8) + '...');
  console.log('SAPO_OFFICE_CD    :', process.env.SAPO_OFFICE_CD);
  console.log('SAPO_USER_FID     :', process.env.SAPO_USER_FID);
  console.log('');

  console.log('Resolved environment:', sapo.isProduction ? 'production' : 'test');
  console.log('URLs:', sapo.urls);
  console.log('');

  // 1. DNS
  const hostname = new URL(sapo.urls.tracking).hostname;
  try {
    const addrs = await dns.lookup(hostname, { all: true });
    pretty(`DNS lookup (${hostname})`, true, addrs.map(a => a.address).join(', '));
  } catch (e) {
    pretty(`DNS lookup (${hostname})`, false, e.code || e.message);
    process.exit(1);
  }

  // 2. Generate a tracking number (TRN manager)
  const custRef = `QS-TEST-${Date.now()}`;
  let trackingNumber = null;
  try {
    const res = await sapo.generateTrackingNumber(custRef);
    trackingNumber = res.trackingNumber;
    pretty('TRN /gen  (generate tracking)', !!res.success, `cust_ref=${res.customerRef || custRef} trn=${trackingNumber}${res.mock ? ' (MOCK)' : ''}`);
  } catch (e) {
    pretty('TRN /gen  (generate tracking)', false, e.message);
  }

  // 3. Submit mail item (Electronic Lodgement) using the freshly generated TRN
  if (trackingNumber) {
    const itemData = {
      trackingNumber,
      orderNumber: custRef,
      weight: 1.250,
      value: 250,
      insuredValue: 0,
      shippingCost: 60,
      express: false,
      sender: {
        name: 'Quicksell Seller',
        firstName: 'Quicksell',
        address: '123 Main Street',
        city: 'Pretoria',
        postalCode: '0001',
        province: 'Gauteng',
        phone: '+27123456789',
        email: 'sender@quicksell.co.za'
      },
      recipient: {
        name: 'Test Buyer',
        firstName: 'Test',
        address: '456 Oak Avenue',
        city: 'Johannesburg',
        postalCode: '2001',
        province: 'Gauteng',
        phone: '+27987654321',
        email: 'buyer@example.com'
      }
    };

    try {
      const res = await sapo.submitMailItem(itemData);
      pretty('IPS Import /Mailitem  (lodge parcel)', !!res.success, `ItemId=${res.data?.MailItem?.ItemId || res.data?.ItemId || trackingNumber}${res.mock ? ' (MOCK)' : ''}`);
    } catch (e) {
      pretty('IPS Import /Mailitem  (lodge parcel)', false, e.message);
    }
  } else {
    pretty('IPS Import /Mailitem  (lodge parcel)', false, 'skipped — no tracking number');
  }

  // 4. Track & Trace — probe with dummy TRN (should be reachable even if empty)
  try {
    const res = await sapo.trackItems('HA0000000000ZA');
    pretty('Track & Trace  (dummy TRN probe)', !!res.success, `items=${(res.items || []).length}`);
  } catch (e) {
    pretty('Track & Trace  (dummy TRN probe)', false, e.message);
  }

  // 5. Track & Trace — real TRN from this test (skip mock)
  if (trackingNumber && !trackingNumber.startsWith('QS')) {
    try {
      const res = await sapo.trackItems(trackingNumber);
      const first = (res.items || [])[0];
      pretty('Track & Trace  (generated TRN)', !!res.success, `items=${(res.items || []).length}${first ? ` first=${first.internationalId || first.InternationalId || trackingNumber}` : ''}`);
    } catch (e) {
      pretty('Track & Trace  (generated TRN)', false, e.message);
    }
  }

  console.log('');
  console.log('--- done ---');
})().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
