const axios = require('axios');
const { admin, db } = require('../config/firebase');
const record = require('./shipmentRecord');

/**
 * USPS provider (USPS APIs v3 — OAuth2 + Domestic Prices + Labels + Tracking).
 *
 * Implements the same 8-method contract as every other provider so the
 * shippingService facade can dispatch to it interchangeably.
 *
 * Set USPS_MOCK_MODE=true (the default until credentials exist) to exercise the
 * whole flow — quote, label, tracking — without calling USPS.
 */
class USPSShippingService {
  constructor() {
    this.mock = process.env.USPS_MOCK_MODE !== 'false';
    this.baseUrl = (process.env.USPS_BASE_URL || 'https://api.usps.com').replace(/\/+$/, '');
    this.clientId = process.env.USPS_CLIENT_ID || '';
    this.clientSecret = process.env.USPS_CLIENT_SECRET || '';
    this.accountNumber = process.env.USPS_ACCOUNT_NUMBER || '';
    this.client = axios.create({ baseURL: this.baseUrl, timeout: 30000 });
    this._token = null; // { access, exp }
  }

  isConfigured() {
    return this.mock || (!!this.clientId && !!this.clientSecret);
  }

  /** OAuth2 client-credentials token, cached until shortly before expiry. */
  async token() {
    if (this.mock) return 'mock-token';
    if (this._token && this._token.exp - 60000 > Date.now()) return this._token.access;

    const res = await this.client.post('/oauth2/v3/token', {
      grant_type: 'client_credentials',
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });
    this._token = {
      access: res.data.access_token,
      exp: Date.now() + Number(res.data.expires_in || 3600) * 1000,
    };
    return this._token.access;
  }

  async headers() {
    return { Authorization: `Bearer ${await this.token()}`, 'Content-Type': 'application/json' };
  }

  // ---- Rates ---------------------------------------------------------------

  async calculateShippingRate(params = {}) {
    const parcels = params.parcels || record.buildParcels(params, params.product || {});
    const weight = record.totalWeight(parcels) || Number(params.weightKg || params.weight || 1);
    const from = params.collection || params.from || {};
    const to = params.delivery || params.to || {};

    if (this.mock) {
      // Rough USPS Ground Advantage shape: base + per-pound.
      const total = Math.round((8.5 + weight * 1.15) * 100) / 100;
      return {
        success: true, currency: 'USD', provider: 'usps', rateId: null,
        serviceLevel: 'USPS Ground Advantage', breakdown: { base: 8.5, perLb: 1.15, weight },
        total, estimatedDays: '2-5', mock: true,
      };
    }

    const body = {
      originZIPCode: from.postalCode || params.originPostalCode,
      destinationZIPCode: to.postalCode || params.destPostalCode,
      weight,
      length: parcels[0]?.lengthIn,
      width: parcels[0]?.widthIn,
      height: parcels[0]?.heightIn,
      mailClass: 'USPS_GROUND_ADVANTAGE',
      processingCategory: 'MACHINABLE',
      rateIndicator: 'SP',
      priceType: 'COMMERCIAL',
      accountNumber: this.accountNumber,
    };

    const res = await this.client.post('/prices/v3/base-rates/search', body, { headers: await this.headers() });
    const rate = res.data?.totalBasePrice ?? res.data?.rates?.[0]?.price;
    if (rate == null) throw new Error('USPS returned no rate for this route');

    return {
      success: true, currency: 'USD', provider: 'usps', rateId: null,
      serviceLevel: 'USPS Ground Advantage', breakdown: res.data,
      total: Number(rate), estimatedDays: '2-5', mock: false,
    };
  }

  // ---- Create shipment -----------------------------------------------------

  async createShipmentForOrder(order) {
    const shipping = order.shippingInfo || order.shippingAddress || {};
    if (!shipping.fullName || !shipping.address || !shipping.city || !shipping.postalCode) {
      throw new Error('Incomplete shipping information. Required: fullName, address, city, postalCode');
    }

    const { product, seller } = await record.loadContext(order);
    const from = record.collectionAddress(order, product, seller);
    const to = record.deliveryAddress(order);
    const parcels = record.buildParcels(order, product);

    let trackingNumber, labelUrl = null, cost = null;

    if (this.mock) {
      trackingNumber = `9400${Date.now()}`.slice(0, 22);
    } else {
      const body = {
        fromAddress: {
          streetAddress: from.street, secondaryAddress: from.street2, city: from.city,
          state: from.state, ZIPCode: from.postalCode, firstName: from.name, phone: from.phone,
        },
        toAddress: {
          streetAddress: to.street, secondaryAddress: to.street2, city: to.city,
          state: to.state, ZIPCode: to.postalCode, firstName: to.name, phone: to.phone,
        },
        packageDescription: {
          mailClass: 'USPS_GROUND_ADVANTAGE',
          weight: record.totalWeight(parcels),
          length: parcels[0]?.lengthIn, width: parcels[0]?.widthIn, height: parcels[0]?.heightIn,
          processingCategory: 'MACHINABLE', rateIndicator: 'SP',
        },
      };
      const res = await this.client.post('/labels/v3/label', body, { headers: await this.headers() });
      trackingNumber = res.data?.trackingNumber;
      labelUrl = res.data?.labelImage || null;
      cost = res.data?.postage ?? null;
      if (!trackingNumber) throw new Error('USPS: no tracking number returned');
    }

    await record.saveShipment(order, {
      trackingNumber, carrier: 'USPS', service: 'USPS Ground Advantage',
      cost, labelUrl, eventDescription: 'Shipping label created with USPS',
      isMock: this.mock,
    });

    return { success: true, trackingNumber, customerRef: order.id, carrier: 'USPS', labelUrl };
  }

  // ---- Tracking ------------------------------------------------------------

  async trackItems(trackingNumbers) {
    const arr = Array.isArray(trackingNumbers) ? trackingNumbers : [trackingNumbers];
    const items = [];
    for (const tn of arr) {
      try { items.push(await this.trackOne(tn)); }
      catch (e) {
        console.warn('USPS track error for', tn, e.message);
        items.push({ trackingNumber: tn, currentStatus: 'Unknown', events: [], error: e.message });
      }
    }
    return { success: true, items };
  }

  async trackOne(trackingNumber) {
    if (this.mock) {
      return {
        trackingNumber, weight: 1,
        origin: { country: 'US', code: '' }, destination: { country: 'US', code: '' },
        characteristics: { express: false, exempt: false, insured: { amount: 0, currency: 'USD' } },
        events: [{ code: 'created', description: 'Shipping label created', office: '', officeCode: '', timestamp: new Date().toISOString(), status: 'Order Shipped' }],
        currentStatus: 'Order Shipped', lastUpdate: new Date().toISOString(),
      };
    }

    const res = await this.client.get(`/tracking/v3/tracking/${encodeURIComponent(trackingNumber)}`, {
      headers: await this.headers(), params: { expand: 'DETAIL' },
    });
    const raw = res.data?.trackingEvents || [];
    const events = raw.map(ev => ({
      code: ev.eventCode || '',
      description: ev.eventType || ev.eventCode || '',
      office: ev.eventCity || '',
      officeCode: ev.eventZIP || '',
      timestamp: ev.eventTimestamp || '',
      status: this.mapStatus(ev.eventType || ev.eventCode || ''),
    }));
    const last = events[0];
    return {
      trackingNumber, weight: res.data?.weight || 1,
      origin: { country: 'US', code: res.data?.originZIP || '' },
      destination: { country: 'US', code: res.data?.destinationZIP || '' },
      characteristics: { express: false, exempt: false, insured: { amount: 0, currency: 'USD' } },
      events,
      currentStatus: last ? last.status : 'Order Shipped',
      lastUpdate: last ? last.timestamp : null,
    };
  }

  /** Map USPS event text to the customer-facing statuses used across the app. */
  mapStatus(code) {
    const c = String(code || '').toLowerCase();
    // Checked before "delivered" so "delivered to agent"/return text can't be misread.
    if (c.includes('return')) return 'Returned to Sender';
    if (c.includes('undeliverable') || c.includes('refused')) return 'Delivery Failed';
    if (c.includes('delivered')) return 'Delivered';
    if (c.includes('out for delivery')) return 'Out for Delivery';
    if (c.includes('available for pickup')) return 'Ready for Collection';
    if (c.includes('in transit') || c.includes('departed') || c.includes('arrived')) return 'In Transit';
    if (c.includes('accepted') || c.includes('picked up') || c.includes('acceptance')) return 'Collected';
    if (c.includes('label') || c.includes('pre-shipment')) return 'Order Shipped';
    return 'Order Shipped';
  }

  // ---- Provider-difference no-ops -------------------------------------------
  async cancelShipment(trackingNumber, reason = 'Customer request') {
    return { success: true, data: { note: 'USPS labels are cancelled via refund request; no direct cancel API', trackingNumber, reason } };
  }
  async markAsDelivered() {
    return { success: true, data: { note: 'USPS delivery status is carrier/webhook driven; no-op' } };
  }
  async updateMailItemEvent() {
    return { success: true, data: { note: 'USPS does not accept merchant-pushed events; no-op' } };
  }
  async generateTrackingNumber(customerRef) {
    // USPS assigns the tracking number when the label is created.
    return { success: true, customerRef, trackingNumber: null, deferred: true };
  }
  async submitMailItem() {
    throw new Error('submitMailItem is not used by USPS; use createShipmentForOrder');
  }
}

module.exports = new USPSShippingService();
