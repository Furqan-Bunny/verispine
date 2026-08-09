#!/usr/bin/env node
/**
 * Traderoot PRODUCTION go-live test.
 *
 * Reads ALL credentials from environment variables — NO hardcoded secrets.
 * Set them in your shell or in backend/.env (which is now git-ignored) before running:
 *
 *   TRADEROOT_BASE_URL=https://securepay.travelbuy.co.za/APIV2nedbank
 *   TRADEROOT_TOKEN_REQUESTER_ID=...
 *   TRADEROOT_KEY=...
 *   TRADEROOT_MERCHANT_ID=...
 *
 * Usage:
 *   node backend/scripts/testTraderootProd.js            # local validation only (no network)
 *   node backend/scripts/testTraderootProd.js --live     # actually POST to the endpoint
 *   node backend/scripts/testTraderootProd.js --live --amount 500   # R5.00 (cents)
 *
 * The script refuses to hit a live (non-UAT) endpoint without the --live flag,
 * so you can't accidentally fire a production request.
 */

const crypto = require('crypto');
const axios = require('axios');
const { v4: uuidv4, v5: uuidv5 } = require('uuid');
const path = require('path');

// Load backend/.env if present (git-ignored). Falls back silently if dotenv missing.
try {
  require(path.join(__dirname, '..', 'node_modules', 'dotenv')).config({
    path: path.join(__dirname, '..', '.env')
  });
} catch (_) { /* dotenv optional */ }

// ---- CLI flags ----
const args = process.argv.slice(2);
const LIVE = args.includes('--live');
const IMMEDIATE = args.includes('--immediate'); // test the e-Commerce /initiateimmediatepayment flow
const amountIdx = args.indexOf('--amount');
const AMOUNT_CENTS = amountIdx !== -1 ? parseInt(args[amountIdx + 1], 10) : 500; // default R5.00

// ---- Config from env ----
const BASE_URL = (process.env.TRADEROOT_BASE_URL || '').replace(/\/+$/, '');
const TOKEN_REQUESTER_ID = process.env.TRADEROOT_TOKEN_REQUESTER_ID || '';
const TOKEN_REQUESTER_KEY = process.env.TRADEROOT_KEY || '';
const MERCHANT_ID = process.env.TRADEROOT_MERCHANT_ID || '';
const WALLET_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

const CALLBACK_URL = (process.env.FRONTEND_URL || 'https://www.verispinejointcenters.com').replace(/\/+$/, '') + '/payment/traderoot-callback?step=issue';
const NOTIFICATION_URL = (process.env.SERVER_URL || 'https://www.verispinejointcenters.com').replace(/\/+$/, '') + '/api/payments/traderoot/notification';

const IS_UAT = /travelbuy\.traderoot\.com:9973/.test(BASE_URL);

function mask(val) {
  if (!val) return '(empty)';
  if (val.length <= 6) return val[0] + '***';
  return val.slice(0, 4) + '...' + val.slice(-2);
}

function fail(msg) {
  console.error('\n[x] ' + msg);
  process.exit(1);
}

// ---- 1. Validate config ----
console.log('='.repeat(64));
console.log('TRADEROOT PRODUCTION TEST');
console.log('='.repeat(64));
console.log('Endpoint        :', BASE_URL || '(not set)');
console.log('Environment     :', IS_UAT ? 'UAT / Sandbox' : 'PRODUCTION (or unknown)');
console.log('TokenRequesterID:', TOKEN_REQUESTER_ID || '(not set)');
console.log('TokenRequesterKy:', mask(TOKEN_REQUESTER_KEY));
console.log('MerchantID      :', MERCHANT_ID || '(not set)');
console.log('Callback URL    :', CALLBACK_URL);
console.log('Notification URL:', NOTIFICATION_URL);
console.log('Amount (cents)  :', AMOUNT_CENTS, `($${(AMOUNT_CENTS / 100).toFixed(2)})`);
console.log('Mode            :', LIVE ? 'LIVE (will POST)' : 'DRY-RUN (local validation only)');
console.log('='.repeat(64));

if (!BASE_URL) fail('TRADEROOT_BASE_URL is not set.');
if (!TOKEN_REQUESTER_ID) fail('TRADEROOT_TOKEN_REQUESTER_ID is not set.');
if (!TOKEN_REQUESTER_KEY) fail('TRADEROOT_KEY is not set.');
if (!MERCHANT_ID) fail('TRADEROOT_MERCHANT_ID is not set.');

const aesKey = Buffer.from(TOKEN_REQUESTER_KEY.replace(/-/g, ''), 'utf8');
if (aesKey.length !== 32) {
  fail(`Derived AES key is ${aesKey.length} bytes, must be 32. ` +
       `Check TRADEROOT_KEY is a UUID (36 chars with dashes -> 32 without).`);
}
console.log('[v] AES key is 32 bytes (AES-256 OK)');

// ---- 2. Build assuranceData (same as traderootService.js) ----
function generateAssuranceData(sessionId, walletId) {
  const payload = JSON.stringify({
    timestamp: Date.now(),
    digitalWalletId: walletId,
    sessionId: sessionId
  });
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', aesKey, iv);
  const ct = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
  return { assuranceData: Buffer.concat([iv, ct]).toString('base64'), inner: payload };
}

const sessionId = uuidv4();
const walletId = uuidv5(`minzolor-wallet-prod-test-${Date.now()}`, WALLET_NAMESPACE);
const transmissionDateTime = new Date().toISOString().replace(/\.\d{3}Z$/, '+0000');
const { assuranceData, inner } = generateAssuranceData(sessionId, walletId);

// ---- 3. Local decryption self-check ----
(function selfCheck() {
  const decoded = Buffer.from(assuranceData, 'base64');
  const iv = decoded.subarray(0, 16);
  const ct = decoded.subarray(16);
  const decipher = crypto.createDecipheriv('aes-256-cbc', aesKey, iv);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  const parsed = JSON.parse(pt);
  if (parsed.sessionId !== sessionId) fail('Self-check: inner sessionId != outer sessionId');
  if (parsed.digitalWalletId !== walletId) fail('Self-check: walletId mismatch');
  const ageSec = (Date.now() - parsed.timestamp) / 1000;
  if (ageSec > 5) fail(`Self-check: timestamp already ${ageSec}s old`);
  console.log('[v] Local encrypt/decrypt roundtrip OK (sessionId + walletId match, fresh timestamp)');
})();

// ---- e-Commerce Immediate Payment mode (PA0063) ----
// Exercises the real backend service so the new signature/assurance code is validated against prod.
if (IMMEDIATE) {
  const traderoot = require(path.join(__dirname, '..', 'services', 'traderootService'));
  (async () => {
    const sid = uuidv4();
    const walletId = traderoot.getDigitalWalletId('prod-test-user');
    const immRrn = traderoot.generateRRN();
    console.log('\n--- IMMEDIATE PAYMENT (e-Commerce /initiateimmediatepayment) ---');
    console.log('Mode            :', LIVE ? 'LIVE (will POST)' : 'DRY-RUN (local only)');
    const ad = traderoot.generateImmediateAssuranceData(sid, walletId, {
      merchantId: MERCHANT_ID, transactionAmount: AMOUNT_CENTS, currencyCode: '710', rrn: immRrn
    });
    console.log('[v] assuranceData built (len ' + ad.length + ')');
    if (!LIVE) {
      console.log('[i] DRY-RUN complete. Re-run with --immediate --live to POST.');
      if (!IS_UAT) console.log('[!] NOTE: endpoint looks like PRODUCTION.');
      process.exit(0);
    }
    const result = await traderoot.initiateImmediatePayment({
      sessionId: sid, walletId, amount: AMOUNT_CENTS, rrn: immRrn,
      callbackUrl: CALLBACK_URL, notificationUrl: NOTIFICATION_URL, echoData: 'prodtest'
    });
    console.log('\n--- Result ---');
    console.log('httpOk          :', result.success);
    console.log('responseCode    :', result.data?.responseCode);
    console.log('responseMessage :', result.data?.responseMessage);
    const initUrl = result.data?.peripheryData?.initiationUrl;
    console.log('initiationUrl   :', initUrl || '(none)');
    if (result.data?.responseCode === '00' && initUrl) {
      console.log('[v] APPROVED. Open this URL — card entry + 3DS + payment happen on ONE page:');
      console.log('    ', initUrl);
      process.exit(0);
    }
    console.log('[x] Not approved. If responseCode is 06, the assurance signature form is likely wrong —');
    console.log('    see the _buildPaymentSignature note in services/traderootService.js (key with vs without dashes).');
    process.exit(1);
  })();
  return;
}

const payload = {
  transmissionDateTime,
  tokenRequesterId: TOKEN_REQUESTER_ID,
  assuranceData,
  sessionId,
  currencyCode: '710',
  transactionAmount: AMOUNT_CENTS,
  merchantId: MERCHANT_ID,
  peripheryData: {
    callbackUrl: CALLBACK_URL,
    notificationUrl: NOTIFICATION_URL
  }
};

console.log('\n--- Payload to send ---');
console.log(JSON.stringify({ ...payload, assuranceData: assuranceData.slice(0, 32) + '...(truncated)' }, null, 2));
console.log('Inner (decrypted) JSON:', inner);

// ---- 4. Send (only with --live) ----
if (!LIVE) {
  console.log('\n[i] DRY-RUN complete. Config + encryption are valid.');
  console.log('[i] Re-run with --live to actually POST to the endpoint.');
  if (!IS_UAT) {
    console.log('[!] NOTE: endpoint looks like PRODUCTION. A --live run may move REAL money.');
  }
  process.exit(0);
}

(async () => {
  const url = `${BASE_URL}/initiateissuetoken`;
  console.log(`\n--- POST ${url} ---`);
  try {
    const res = await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 60000
    });
    console.log(`[OK ${res.status}]`);
    console.log('Response:', JSON.stringify(res.data, null, 2));

    // Try to extract responseCode regardless of nesting
    const body = res.data?.data?.data || res.data?.data || res.data;
    const rc = body?.responseCode;
    const rm = body?.responseMessage;
    const initUrl = body?.initiationUrl || body?.peripheryData?.initiationUrl;

    console.log('\n--- Result ---');
    console.log('responseCode    :', rc);
    console.log('responseMessage :', rm);
    if (rc === '00') {
      console.log('[v] APPROVED. Open this URL in a browser to complete card entry + 3DS:');
      console.log('    ', initUrl || '(no initiationUrl returned — check response above)');
    } else {
      console.log('[x] NOT approved. See responseCode above.');
      console.log('    06 = Assurance data invalid (key/IV/sessionId problem)');
      console.log('    Check the endpoint, credentials, and that the key matches this merchant.');
    }
  } catch (e) {
    const status = e.response?.status || 'ERR';
    const data = e.response?.data || e.message;
    console.error(`[FAIL ${status}]`);
    console.error(typeof data === 'string' ? data.slice(0, 800) : JSON.stringify(data, null, 2).slice(0, 800));
    process.exit(1);
  }
})();
