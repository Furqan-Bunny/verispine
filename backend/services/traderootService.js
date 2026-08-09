const axios = require('axios');
const crypto = require('crypto');
const { v4: uuidv4, v5: uuidv5 } = require('uuid');

// Namespace UUID for generating deterministic wallet IDs from Firebase UIDs
const WALLET_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'; // DNS namespace

/**
 * Traderoot e-Commerce Payment Gateway (PA0063 v2.16).
 *
 * VeriSpine is a website, so it uses the e-Commerce *Immediate Payment* flow:
 * a single POST /initiateimmediatepayment returns one hosted-page initiationUrl
 * that performs card entry + 3-D Secure + settlement in one journey. The outcome
 * arrives via a server-to-server notification (authoritative) and a browser
 * callback redirect (UX). This replaces the old mCommerce 3-step token flow
 * (issue token -> authenticate token -> financial request).
 */
class TraderootService {
  constructor() {
    this.tokenRequesterId = process.env.TRADEROOT_TOKEN_REQUESTER_ID || '00123456792';
    this.merchantId = process.env.TRADEROOT_MERCHANT_ID || '550000000000003';
    this.baseUrl = (process.env.TRADEROOT_BASE_URL || 'https://travelbuy.traderoot.com:9973/APIV2').replace(/\/+$/, '');

    // Merchant private key UUID, provided by Traderoot at setup.
    // - For the SHA-512 SIGNATURE it is used as-is (with dashes), lowercased (per spec example).
    // - For AES-256 ENCRYPTION the dashes are removed -> 32 ASCII chars = 256-bit key.
    this.keyUuid = process.env.TRADEROOT_KEY || '14cc5ddd-ba18-4ec3-ad73-8231c9b0eb37';
    this.aesKey = Buffer.from(this.keyUuid.replace(/-/g, ''), 'utf8');

    this.currencyCode = '710'; // ZAR in ISO 4217
  }

  // Generate a deterministic digital wallet ID from a user's Firebase UID
  getDigitalWalletId(userId) {
    return uuidv5(`minzolor-wallet-${userId}`, WALLET_NAMESPACE);
  }

  // Generate a 12-char RRN
  generateRRN() {
    return Date.now().toString().slice(-12);
  }

  // ISO 8601 timestamp in UTC
  getTransmissionDateTime() {
    return new Date().toISOString().replace(/\.\d{3}Z$/, '+0000');
  }

  /**
   * Build the SHA-512 signature required by Initiate (Immediate/Delayed/Recurring) Payment.
   * Concatenate (in this order, then lowercase): merchantId + transactionAmount + currencyCode
   * + retrievalReferenceNumber + [retrievalReferenceNumberExtended] + sessionId + privateKey.
   *
   * NOTE: per the PA0063 example the private key is the UUID *with dashes* (this.keyUuid). If
   * immediate payment is rejected with responseCode 06 (assurance/signature invalid), the first
   * thing to try is swapping `this.keyUuid` here for `this.aesKey.toString('utf8')` (dashes
   * stripped) — only one form is correct for this merchant and it can't be verified until the
   * endpoint is enabled.
   */
  _buildPaymentSignature(sessionId, { merchantId, transactionAmount, currencyCode, rrn, rrnExtended }) {
    const parts = [
      merchantId || this.merchantId,
      String(transactionAmount),
      currencyCode || this.currencyCode,
      rrn
    ];
    if (rrnExtended) parts.push(rrnExtended);
    parts.push(sessionId);
    parts.push(this.keyUuid);

    const concatenated = parts.join('').toLowerCase();
    return crypto.createHash('sha512').update(concatenated).digest('hex').toUpperCase();
  }

  // AES-256-CBC encrypt a JSON payload, return base64(IV + ciphertext)
  _encryptAssurance(payloadObj) {
    const payload = JSON.stringify(payloadObj);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', this.aesKey, iv);
    const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, encrypted]).toString('base64');
  }

  /**
   * Assurance Data for Initiate Immediate Payment: encrypted JSON of
   * { timestamp, digitalWalletId, signature, sessionId }.
   */
  generateImmediateAssuranceData(sessionId, digitalWalletId, sigParams) {
    return this._encryptAssurance({
      timestamp: Date.now(),
      digitalWalletId: digitalWalletId,
      signature: this._buildPaymentSignature(sessionId, sigParams),
      sessionId: sessionId
    });
  }

  /**
   * Assurance Data with SHA-512 signature for refunds (no digitalWalletId required per spec).
   */
  generateRefundAssuranceData(sessionId, sigParams) {
    return this._encryptAssurance({
      timestamp: Date.now(),
      signature: this._buildPaymentSignature(sessionId, sigParams),
      sessionId: sessionId
    });
  }

  /**
   * Verify the assurance data Traderoot embeds in a notification message.
   * Decrypts, checks the inner sessionId, the timestamp window (~5 min), and — when the
   * transaction fields are supplied — recomputes and compares the signature.
   * Returns { valid, reason?, payload? }.
   */
  verifyNotificationAssurance(assuranceData, sessionId, sigParams) {
    try {
      const raw = Buffer.from(assuranceData, 'base64');
      const iv = raw.subarray(0, 16);
      const ct = raw.subarray(16);
      const decipher = crypto.createDecipheriv('aes-256-cbc', this.aesKey, iv);
      const pt = Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
      const parsed = JSON.parse(pt);

      if (sessionId && parsed.sessionId !== sessionId) {
        return { valid: false, reason: 'sessionId mismatch' };
      }
      const ageMs = Date.now() - Number(parsed.timestamp);
      if (!(ageMs >= -60 * 1000 && ageMs <= 5 * 60 * 1000)) {
        return { valid: false, reason: 'timestamp out of range' };
      }
      if (sigParams && parsed.signature) {
        const expected = this._buildPaymentSignature(parsed.sessionId, sigParams);
        if (String(parsed.signature).toUpperCase() !== expected.toUpperCase()) {
          return { valid: false, reason: 'signature mismatch' };
        }
      }
      return { valid: true, payload: parsed };
    } catch (e) {
      return { valid: false, reason: e.message };
    }
  }

  // POST to Traderoot API
  async _post(endpoint, payload) {
    const url = `${this.baseUrl}/${endpoint}`;
    try {
      const res = await axios.post(url, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      });
      return { success: true, data: res.data };
    } catch (error) {
      const status = error.response?.status;
      const data = error.response?.data;
      console.error(`Traderoot ${endpoint} error:`, { status, data: data || error.message });
      return {
        success: false,
        status,
        error: data?.responseMessage || data?.responseCode || error.message,
        data: data || null
      };
    }
  }

  /**
   * Initiate Immediate Payment (e-Commerce) — single hosted page: card entry + 3-D Secure + settle.
   * Returns { success, data: { responseCode, transactionId, peripheryData: { initiationUrl } } }.
   * Redirect the browser to initiationUrl; the outcome arrives via notificationUrl (webhook) and
   * callbackUrl (browser redirect with a base64 `data` param).
   */
  async initiateImmediatePayment({ sessionId, walletId, amount, rrn, callbackUrl, notificationUrl, echoData, rrnExtended }) {
    const retrievalReferenceNumber = rrn || this.generateRRN();
    // The Nedbank e-Commerce gateway REQUIRES retrievalReferenceNumberExtended (the spec marks it
    // optional, but this deployment rejects the request without it). Always send one, and use the
    // SAME value in the signature so it matches.
    const rrnExt = rrnExtended || `QS${retrievalReferenceNumber}`;
    const sigParams = {
      merchantId: this.merchantId,
      transactionAmount: amount,
      currencyCode: this.currencyCode,
      rrn: retrievalReferenceNumber,
      rrnExtended: rrnExt
    };

    const payload = {
      transmissionDateTime: this.getTransmissionDateTime(),
      merchantId: this.merchantId,
      sessionId: sessionId,
      transactionAmount: amount,
      currencyCode: this.currencyCode,
      retrievalReferenceNumber: retrievalReferenceNumber,
      retrievalReferenceNumberExtended: rrnExt,
      transactionInfo: {
        transactionCategory: '95' // 95 = 3-D Secure (default), 94 = MOTO
      },
      peripheryData: {
        callbackUrl: callbackUrl || undefined,
        notificationUrl: notificationUrl || undefined
      },
      assuranceData: this.generateImmediateAssuranceData(sessionId, walletId, sigParams)
    };
    if (echoData) payload.echoData = echoData;

    return this._post('initiateimmediatepayment', payload);
  }

  /**
   * Refund Payment — refund a settled payment (e-Commerce /refundpayment).
   * For a single-payment refund, pass originalTransactionId. Card refunds omit paymentToken.
   */
  async refundPayment({ sessionId, paymentToken, amount, rrn, rrnExtended, originalTransactionId }) {
    const retrievalReferenceNumber = rrn || this.generateRRN();
    const refundAssurance = this.generateRefundAssuranceData(sessionId, {
      merchantId: this.merchantId,
      transactionAmount: amount,
      currencyCode: this.currencyCode,
      rrn: retrievalReferenceNumber,
      rrnExtended
    });

    const payload = {
      transmissionDateTime: this.getTransmissionDateTime(),
      assuranceData: refundAssurance,
      sessionId: sessionId,
      transactionAmount: amount,
      currencyCode: this.currencyCode,
      transactionId: uuidv4(),
      transactionDate: new Date().toISOString().split('T')[0],
      transactionTime: new Date().toISOString().split('T')[1].replace(/\.\d{3}Z$/, '+0000'),
      retrievalReferenceNumber: retrievalReferenceNumber,
      merchantId: this.merchantId,
      transactionInfo: {
        tenderTypeCode: '00' // Card
      }
    };
    if (paymentToken) payload.paymentToken = paymentToken;
    if (originalTransactionId) payload.originalTransactionData = { originalTransactionId };
    if (rrnExtended) payload.retrievalReferenceNumberExtended = rrnExtended;

    return this._post('refundpayment', payload);
  }

  /**
   * Decode the base64 `data` query param returned by Traderoot callbacks
   */
  decodeCallbackData(base64Data) {
    try {
      const json = Buffer.from(base64Data, 'base64').toString('utf8');
      return JSON.parse(json);
    } catch (e) {
      console.error('Traderoot callback decode error:', e.message);
      return null;
    }
  }
}

module.exports = new TraderootService();
