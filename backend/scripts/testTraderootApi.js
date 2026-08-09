// Traderoot Payment Gateway API — connectivity + auth test
// Usage: node backend/scripts/testTraderootApi.js

const crypto = require('crypto');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

// Credentials
const TOKEN_REQUESTER_ID = '00123456792';
const TOKEN_REQUESTER_KEY = '14cc5ddd-ba18-4ec3-ad73-8231c9b0eb37';
const MERCHANT_ID = '550000000000003';
const BASE_URL = 'https://travelbuy.traderoot.com:9973/APIV2';

// Derive AES-256 key: UUID without dashes = 32 ASCII chars = 32 bytes = 256 bits
const AES_KEY = Buffer.from(TOKEN_REQUESTER_KEY.replace(/-/g, ''), 'utf8');

console.log('--- Traderoot API Test ---');
console.log('Base URL         :', BASE_URL);
console.log('Token Requester  :', TOKEN_REQUESTER_ID);
console.log('Merchant ID      :', MERCHANT_ID);
console.log('AES Key length   :', AES_KEY.length, 'bytes =', AES_KEY.length * 8, 'bits');
console.log('');

function generateAssuranceData(sessionId, digitalWalletId) {
  const payload = JSON.stringify({
    timestamp: Date.now(),
    digitalWalletId: digitalWalletId || uuidv4(),
    sessionId: sessionId
  });

  // Random 16-byte IV
  const iv = crypto.randomBytes(16);

  // AES-256-CBC with PKCS5 padding (Node calls it PKCS7, same thing)
  const cipher = crypto.createCipheriv('aes-256-cbc', AES_KEY, iv);
  let encrypted = cipher.update(payload, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);

  // Result: IV + ciphertext, base64 encoded
  const result = Buffer.concat([iv, encrypted]).toString('base64');
  return result;
}

async function testCall(label, endpoint, payload) {
  const url = `${BASE_URL}/${endpoint}`;
  console.log(`\n${'='.repeat(60)}`);
  console.log(`TEST: ${label}`);
  console.log(`POST ${url}`);
  console.log(`${'='.repeat(60)}`);

  try {
    const res = await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    });
    console.log(`[OK   ${res.status}]`);
    console.log('Response:', JSON.stringify(res.data, null, 2).slice(0, 1000));
    return res.data;
  } catch (e) {
    const status = e.response?.status || 'ERR';
    const data = e.response?.data || e.message;
    console.log(`[FAIL ${status}]`);
    console.log('Response:', typeof data === 'string' ? data.slice(0, 500) : JSON.stringify(data, null, 2).slice(0, 500));
    return null;
  }
}

(async () => {
  const sessionId = uuidv4();
  const walletId = uuidv4();
  const rrn = Date.now().toString().slice(-12);
  const now = new Date();
  const transmissionDateTime = now.toISOString().replace(/\.\d{3}Z$/, '+0000');

  console.log('Session ID       :', sessionId);
  console.log('Wallet ID        :', walletId);
  console.log('RRN              :', rrn);
  console.log('Timestamp        :', transmissionDateTime);

  const assuranceData = generateAssuranceData(sessionId, walletId);
  console.log('Assurance Data   :', assuranceData.slice(0, 40) + '...');

  // Test 1: Resolve Merchant Information
  await testCall('Resolve Merchant Information', 'resolvemerchantinformation', {
    transmissionDateTime,
    tokenRequesterId: TOKEN_REQUESTER_ID,
    merchantId: MERCHANT_ID,
    currencyCode: '710',
    retrievalReferenceNumber: rrn,
    assuranceData,
    sessionId
  });

  // Test 2: List Tokens
  await testCall('List Tokens', 'listtokens', {
    transmissionDateTime,
    tokenRequesterId: TOKEN_REQUESTER_ID,
    merchantId: MERCHANT_ID,
    assuranceData,
    sessionId,
    digitalWalletId: walletId
  });

  // Test 3: Initiate Issue Token (this would start a card-add flow)
  await testCall('Initiate Issue Token', 'initiateissuetoken', {
    transmissionDateTime,
    tokenRequesterId: TOKEN_REQUESTER_ID,
    merchantId: MERCHANT_ID,
    transactionAmount: 5000,
    currencyCode: '710',
    assuranceData,
    sessionId,
    peripheryData: {
      callbackUrl: 'https://verispinejointcenters.com/payment/callback',
      notificationUrl: 'https://verispinejointcenters.com/api/payments/traderoot/notification'
    }
  });

  console.log(`\n${'='.repeat(60)}`);
  console.log('ALL TESTS COMPLETE');
  console.log(`${'='.repeat(60)}`);
})().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
