const axios = require('axios');
const { admin, db } = require('../config/firebase');
const { getParcelDimensions } = require('../utils/parcelDimensions');

/**
 * Pargo courier provider — Click & Collect / pickup-point (Pargo API, OAuth2).
 *
 * Implements the SAME public contract as the other providers so the shippingService facade can
 * dispatch to it: createShipmentForOrder, calculateShippingRate, trackItems, cancelShipment,
 * markAsDelivered, updateMailItemEvent, generateTrackingNumber, submitMailItem.
 *
 * Pargo is pickup-point based: the parcel goes to a Pargo point the buyer selects at checkout
 * (stored on the order as `pargoPoint`), and the buyer collects it there. We use the W2P
 * (Warehouse -> Pickup Point) order type, dynamic-warehouse variant (seller address sent inline).
 *
 * Auth: POST /auth {username,password} -> Bearer token (cached until expiry).
 * Set PARGO_MOCK_MODE=true to exercise the whole flow without calling the live API. Pargo stays
 * OFF as an active provider until real credentials + the plan's open items are confirmed.
 */
class PargoShippingService {
  constructor() {
    this.mock = process.env.PARGO_MOCK_MODE === 'true';
    this.baseUrl = (process.env.PARGO_BASE_URL || 'https://api.pargo.co.za').replace(/\/+$/, '');
    this.username = process.env.PARGO_USERNAME || '';
    this.password = process.env.PARGO_PASSWORD || '';
    this.mapToken = process.env.PARGO_MAP_TOKEN || '';
    this.supportName = process.env.PARGO_SUPPORT_NAME || 'VeriSpine';
    this.supportPhone = process.env.PARGO_SUPPORT_PHONE || '0000000000';
    this.supportEmail = process.env.PARGO_SUPPORT_EMAIL || 'info@verispinejointcenters.com';
    this.client = axios.create({ baseURL: this.baseUrl, headers: { 'Content-Type': 'application/json' }, timeout: 30000 });
    this._token = null;      // { access, refresh, exp(ms) }
  }

  isConfigured() {
    return this.mock || (!!this.username && !!this.password);
  }

  nowIso() { return new Date().toISOString(); }

  // ---- Auth (token cached in memory + persisted to Firestore) -----------------
  // Pargo allows only ONE active auth token per account (valid ~70 min); requesting a new one while
  // the current is still valid returns 429 ("you already have a valid auth token"). The service is a
  // singleton so it caches in memory, but a process restart (e.g. a Railway redeploy) loses that and
  // would 429 on the next call. So we ALSO persist the token to Firestore (settings/pargoAuth) and
  // reuse it across restarts / separate processes.
  async token() {
    if (this.mock) return 'mock-token';
    const now = Date.now();
    // 1) in-memory (fast path)
    if (this._token && this._token.exp - 60000 > now) return this._token.access;
    // 2) persisted token (survives restarts and separate processes)
    if (db) {
      try {
        const snap = await db.collection('settings').doc('pargoAuth').get();
        const t = snap.exists ? (snap.data() || {}) : {};
        if (t.access && Number(t.exp) - 60000 > now) {
          this._token = { access: t.access, exp: Number(t.exp) };
          return t.access;
        }
      } catch (e) { console.warn('Pargo: token load from Firestore failed:', e.message); }
    }
    // 3) authenticate (only when no valid token exists anywhere)
    try {
      const r = await this.client.post('/auth', { username: this.username, password: this.password });
      const data = r.data || {};
      this._token = { access: data.access_token, exp: Date.now() + (Number(data.expires_in || 4200) * 1000) };
      await this._persistToken();
      return this._token.access;
    } catch (e) {
      // Pargo enforces one active token per account. If we lost our copy but it hasn't expired yet,
      // /auth returns 429 — fall back to the persisted token if present rather than failing.
      if (e.response && e.response.status === 429 && db) {
        try {
          const snap = await db.collection('settings').doc('pargoAuth').get();
          if (snap.exists && snap.data() && snap.data().access) {
            const t = snap.data();
            this._token = { access: t.access, exp: Number(t.exp) || (now + 60000) };
            return this._token.access;
          }
        } catch (_) { /* fall through to throw */ }
      }
      throw e;
    }
  }

  async _persistToken() {
    if (!db || !this._token) return;
    try {
      await db.collection('settings').doc('pargoAuth').set({
        access: this._token.access, exp: this._token.exp, updatedAt: new Date(),
      });
    } catch (e) { console.warn('Pargo: token persist to Firestore failed:', e.message); }
  }

  async authHeaders() {
    return { Authorization: `Bearer ${await this.token()}` };
  }

  // ---- Order enrichment (payment pipeline passes a bare order) ---------------
  async loadContext(order) {
    let product = null;
    if (order.productId && db) {
      try { const p = await db.collection('products').doc(order.productId).get(); if (p.exists) product = p.data(); }
      catch (e) { console.warn('Pargo: product fetch failed:', e.message); }
    }
    let seller = order.seller || null;
    if (!seller && order.sellerId && db) {
      try { const s = await db.collection('users').doc(order.sellerId).get(); if (s.exists) seller = s.data(); }
      catch (e) { console.warn('Pargo: seller fetch failed:', e.message); }
    }
    return { product: product || {}, seller: seller || {} };
  }

  weights(order, product) {
    const dims = getParcelDimensions(product && (product.dimensions || product.weight) ? product : { weight: order.weight || order.productWeight });
    const dead = Number(order.weight || order.productWeight || (product && product.weight) || 1);
    const cubic = Math.round((Number(dims.length) * Number(dims.width) * Number(dims.height)) / 5000 * 1000) / 1000;
    return { deadWeight: dead, cubicWeight: cubic > 0 ? cubic : dead };
  }

  splitName(full) {
    const parts = String(full || 'Customer').trim().split(/\s+/);
    return { firstName: parts[0] || 'Customer', lastName: parts.slice(1).join(' ') || parts[0] || 'Customer' };
  }

  // ---- Rate (live Pargo quotation: POST /orders/quotation, W2P) ---------------
  // Grounded in the Simba API "Get Quotation W2P": request { data:{ type:'W2P', attributes:{
  //   pickupPointCode, consignee:{firstName,lastName,email,phoneNumbers[]}, cubicWeight, deadWeight,
  //   parcels:[{length,width,height}] } } }; response price at data.attributes.quotation.price.
  // The endpoint needs a chosen pickup point + consignee, which aren't known for a pre-point-selection
  // quote — in that case we return a graceful estimate so checkout still shows a price.
  async calculateShippingRate(params = {}) {
    const w = Number(params.weightKg || params.weight || 1);
    if (this.mock) {
      return { success: true, currency: 'ZAR', provider: 'pargo', rateId: null, serviceLevel: 'Pargo Click & Collect', breakdown: {}, total: 55 + w * 8, estimatedDays: '2-4', mock: true };
    }
    const pointCode = params.pickupPointCode || (params.pargoPoint && params.pargoPoint.code) || '';
    try {
      if (pointCode) {
        const c = params.consignee || {};
        const { firstName, lastName } = this.splitName(c.fullName || `${c.firstName || ''} ${c.lastName || ''}`.trim());
        const dims = (Array.isArray(params.dimensions) && params.dimensions.length ? params.dimensions : [{}])
          .map(d => ({ length: Number(d.length) || 0, width: Number(d.width) || 0, height: Number(d.height) || 0 }));
        const cubic = dims.reduce((s, d) => s + (d.length * d.width * d.height) / 5000, 0);
        const body = { data: { type: 'W2P', attributes: {
          pickupPointCode: pointCode,
          externalReference: params.externalReference || null,
          consignee: {
            firstName, lastName,
            email: c.email || this.supportEmail,
            phoneNumbers: [String(c.phone || c.phoneNumber || '').replace(/\s+/g, '')].filter(Boolean),
          },
          cubicWeight: Math.round((cubic > 0 ? cubic : w) * 1000) / 1000,
          deadWeight: w,
          parcels: dims,
        } } };
        const res = await this.client.post('/orders/quotation', body, { headers: await this.authHeaders() });
        const q = res.data && res.data.data && res.data.data.attributes && res.data.data.attributes.quotation;
        if (q && q.price != null) {
          return { success: true, currency: 'ZAR', provider: 'pargo', rateId: null, serviceLevel: 'Pargo Click & Collect', breakdown: q, total: Number(q.price), estimatedDays: '2-4', mock: false };
        }
      }
    } catch (e) { console.warn('Pargo live quotation failed (falling back to estimate):', e.message); }
    // Fallback estimate (no pickup point yet, or quotation unavailable).
    return { success: true, currency: 'ZAR', provider: 'pargo', rateId: null, serviceLevel: 'Pargo Click & Collect', breakdown: {}, total: 60 + w * 9, estimatedDays: '2-4', mock: false };
  }

  // ---- Create shipment (W2P order, dynamic warehouse) ------------------------
  async createShipmentForOrder(order) {
    const shipping = order.shippingInfo || order.shippingAddress || {};
    const point = order.pargoPoint || {};
    if (!point.code) throw new Error('No Pargo pickup point selected for this order');
    if (!shipping.fullName || !shipping.email || !shipping.phone) {
      throw new Error('Incomplete contact info. Required for Pargo: fullName, email, phone');
    }

    const { product, seller } = await this.loadContext(order);
    const pk = (product.shipping) || order.pickup || {};
    const sellerName = seller.businessName || seller.sellerProfile?.businessName
      || `${seller.firstName || ''} ${seller.lastName || ''}`.trim() || seller.username || 'VeriSpine Seller';
    const { firstName, lastName } = this.splitName(shipping.fullName);
    const { deadWeight, cubicWeight } = this.weights(order, product);

    const attributes = {
      externalReference: String(order.id),
      packageDescription: (order.productTitle || product.title || 'Item').slice(0, 100),
      pickupPointCode: point.code,
      cubicWeight,
      deadWeight,
      communications: { name: this.supportName, supportPhoneNumber: this.supportPhone, supportEmail: this.supportEmail },
      consignee: {
        firstName, lastName,
        email: shipping.email,
        phoneNumbers: [String(shipping.phone).replace(/\s+/g, '')],
      },
      // W2P dynamic-warehouse: the seller's collection address is sent inline. Pargo's warehouseAddress
      // requires contactName / email / phoneNumber for the collection contact (spec §Orders W2P).
      warehouseAddress: {
        companyName: sellerName,
        address1: pk.pickupAddress || pk.address || '',
        address2: '',
        suburb: pk.pickupSuburb || pk.suburb || '',
        postalCode: pk.pickupPostalCode || pk.postalCode || seller.postalCode || '',
        city: pk.pickupCity || pk.city || '',
        province: pk.pickupProvince || pk.province || '',
        country: 'ZA',
        contactName: sellerName,
        email: seller.email || this.supportEmail,
        phoneNumber: String(seller.phone || seller.phoneNumber || this.supportPhone).replace(/\s+/g, ''),
      },
    };
    const payload = { data: { type: 'W2P', attributes } };

    let trackingNumber, submitResponse;
    if (this.mock) {
      trackingNumber = `PARMOCK${Date.now()}`;
      submitResponse = { mock: true };
    } else {
      const res = await this.client.post('/orders', payload, { headers: await this.authHeaders() });
      const data = (res.data && res.data.data) || res.data || {};
      trackingNumber = data.trackingCode || (data.attributes && data.attributes.trackingCode) || data.waybill || '';
      submitResponse = data;
      if (!trackingNumber) throw new Error('Pargo: no trackingCode/waybill returned');
      // Confirm the order (best-effort; Pargo may auto-confirm).
      try {
        await this.client.post('/orders/green-light', { data: { orderReferences: [trackingNumber] } }, { headers: await this.authHeaders() });
      } catch (e) { console.warn('Pargo green-light failed (non-fatal):', e.message); }
    }

    if (db) {
      const ts = admin ? admin.firestore.FieldValue.serverTimestamp() : new Date();
      await db.collection('shipments').doc(order.id).set({
        orderId: order.id,
        productId: order.productId,
        buyerId: order.buyerId,
        sellerId: order.sellerId,
        trackingNumber,
        customerRef: order.id,
        carrier: 'Pargo',
        deliveryMethod: 'pickup-point',
        pargoPointCode: point.code,
        pargoPointName: point.name || '',
        status: 'shipped',
        currentStatus: 'Order Shipped',
        weight: deadWeight,
        value: Number(order.amount || order.totalAmount || 0),
        shippingCost: Number(order.shippingCost || (order.shipmentRate && order.shipmentRate.total) || 0),
        express: false,
        senderCity: attributes.warehouseAddress.city,
        senderProvince: attributes.warehouseAddress.province,
        recipientCity: point.city || '',
        recipientProvince: point.province || '',
        createdAt: ts, updatedAt: ts, shippedAt: ts,
        events: [{ code: 'created', status: 'Order Shipped', description: 'Order sent to Pargo (Click & Collect)', timestamp: this.nowIso(), office: point.name || 'Pargo', officeName: 'Pargo' }],
        isMock: this.mock,
      });
    }

    return { success: true, trackingNumber, customerRef: order.id, carrier: 'Pargo', submitResponse };
  }

  // ---- Tracking (GET /events/orders/{waybill}) -------------------------------
  async trackItems(trackingNumbers) {
    const arr = Array.isArray(trackingNumbers) ? trackingNumbers : [trackingNumbers];
    const items = [];
    for (const tn of arr) {
      try { items.push(await this.trackOne(tn)); }
      catch (e) { console.warn('Pargo track error for', tn, e.message); items.push({ trackingNumber: tn, currentStatus: 'Unknown', events: [], error: e.message }); }
    }
    return { success: true, items };
  }

  async trackOne(trackingNumber) {
    if (this.mock) {
      return {
        trackingNumber, weight: 1,
        origin: { country: 'ZA', code: '' }, destination: { country: 'ZA', code: '' },
        characteristics: { express: false, exempt: false, insured: { amount: 0, currency: 'ZAR' } },
        events: [{ code: 'created', description: 'Parcel is being prepared', office: '', officeCode: '', timestamp: this.nowIso(), status: 'Order Shipped' }],
        currentStatus: 'Order Shipped', lastUpdate: this.nowIso(),
      };
    }
    const res = await this.client.get(`/events/orders/${encodeURIComponent(trackingNumber)}`, { headers: await this.authHeaders() });
    const data = (res.data && res.data.data) || {};
    const raw = data.events || [];
    const events = raw.map(ev => ({
      code: ev.code || '',
      description: ev.description || ev.title || '',
      office: '', officeCode: '',
      timestamp: ev.date || '',
      // Pass the eventCode too — it's the reliable key for mapStatus (title/description text varies).
      status: this.mapStatus(`${ev.code || ''} ${ev.title || ''} ${ev.description || ''}`),
    }));
    const last = events[events.length - 1];
    return {
      trackingNumber, weight: 1,
      origin: { country: 'ZA', code: '' }, destination: { country: 'ZA', code: '' },
      characteristics: { express: false, exempt: false, insured: { amount: 0, currency: 'ZAR' } },
      events,
      currentStatus: last ? last.status : 'Order Shipped',
      lastUpdate: last ? last.timestamp : null,
    };
  }

  /**
   * Map a Pargo W2P event (its eventCode and/or event-name/description, space-joined) to a
   * customer-facing status. Grounded in Pargo's official event list (Webhooks.xlsx). The eventCode
   * is the reliable key — the description text varies — so we match on it first:
   *   1.20.4.500 order.w2p.status.completed          "collected by customer"  -> Delivered (FINAL, releases funds)
   *   1.20.5.503 order.w2p.action.POD                "proof of delivery by Pargo" -> Delivered
   *   1.20.4.400 order.w2p.status.atCollectionPoint  "ready for collection"   -> Ready for Collection
   *   1.20.4.303 order.w2p.status.courierInVehicle   "on route"               -> Out for Delivery
   *   1.20.4.300/.301/.302/.304 courier* (incl. courierPOD = courier reached the pickup POINT, NOT
   *       the buyer collecting)                                                -> In Transit
   *   1.20.4.200 confirmed / .100 pending / .0 created                          -> Order Shipped
   *   1.20.4.10000 order.w2p.status.cancelled                                   -> Cancelled
   *   1.20.4.10010 notCompleted / .409 timeout                                  -> Delivery Failed
   *   1.20.4.10030 courierEscalation                                            -> In Transit
   * IMPORTANT (W2P): delivered = the customer COLLECTING (.500), NOT the courier's proof-of-delivery
   * to the pickup point (.304) — otherwise seller funds release before the buyer has the parcel.
   */
  mapStatus(text) {
    const c = String(text || '').toLowerCase();
    const code = (c.match(/1\.20\.\d+\.\d+/) || [''])[0]; // e.g. "1.20.4.500"
    const is = (suffix) => code.endsWith(suffix);

    // Delivered — buyer collected the parcel (W2P final) or Pargo proof-of-delivery.
    if (is('.500') || is('.503') || c.includes('status.completed') || c.includes('collected by customer')
        || c.includes('proof of delivery provided by pargo')) return 'Delivered';
    // Cancelled.
    if (is('.10000') || c.includes('status.cancelled')) return 'Cancelled';
    // Failed / not collected in time.
    if (is('.10010') || is('.409') || c.includes('notcompleted') || c.includes('not collected')
        || c.includes('could not be delivered') || c.includes('undeliverable') || c.includes('timeout')) return 'Delivery Failed';
    // At the pickup point, ready for the buyer.
    if (is('.400') || c.includes('atcollectionpoint') || c.includes('ready for customer collection')
        || c.includes('ready for collection') || c.includes('ready to be collected') || c.includes('at pickup')
        || c.includes('arrived at pickup') || c.includes('at pargo') || c.includes('available for collection')) return 'Ready for Collection';
    // Out for delivery (courier en route with the parcel).
    if (is('.303') || c.includes('courierinvehicle') || c.includes('on route') || c.includes('out for delivery')) return 'Out for Delivery';
    // Early lifecycle (created / pending / confirmed / "courier informed to collect"). Checked BEFORE
    // "In Transit" so a confirmed event whose text merely mentions "courier" isn't misread as in-transit.
    if (is('.200') || is('.100') || is('.0') || c.includes('status.confirmed') || c.includes('status.pending')
        || c.includes('created') || c.includes('prepared') || c.includes('being prepared')) return 'Order Shipped';
    // In transit — courier-side movement, incl. courierPOD (.304 = reached the pickup POINT, not the buyer).
    if (is('.300') || is('.301') || is('.302') || is('.304') || is('.10030')
        || c.includes('courier') || c.includes('captured by courier') || c.includes('at depot')
        || c.includes('in transit') || c.includes('hub') || c.includes('escalation')) return 'In Transit';
    // Returned to sender (rare for W2P).
    if (c.includes('return')) return 'Returned to Sender';
    return 'Order Shipped';
  }

  // ---- Label helper ----------------------------------------------------------
  async getLabelUrl(trackingNumber) {
    if (this.mock) return { success: true, url: null, note: 'mock' };
    return { success: true, url: `${this.baseUrl}/orders/${encodeURIComponent(trackingNumber)}/label` };
  }

  // ---- Cancel / provider-difference no-ops -----------------------------------
  async cancelShipment(trackingNumber, reason = 'Customer request') {
    return { success: true, data: { note: 'Pargo cancellation is handled with Pargo support; no direct cancel here', trackingNumber, reason } };
  }
  async markAsDelivered(trackingNumber, signature) {
    return { success: true, data: { note: 'Pargo collection/delivery is courier/webhook driven; no-op' } };
  }
  async updateMailItemEvent(trackingNumber, eventCode, additionalData = {}) {
    return { success: true, data: { note: 'Pargo does not accept merchant-pushed events; no-op' } };
  }
  async generateTrackingNumber(customerRef) {
    return { success: true, customerRef, trackingNumber: null, deferred: true };
  }
  async submitMailItem() {
    throw new Error('submitMailItem is SAPO-specific; Pargo uses createShipmentForOrder');
  }
}

module.exports = new PargoShippingService();
