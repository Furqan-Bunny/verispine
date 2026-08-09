const axios = require('axios');
const { admin, db } = require('../config/firebase');
const { getParcelDimensions } = require('../utils/parcelDimensions');

/**
 * ShipLogic courier provider (nationwide SA courier — powers The Courier Guy/Bob Go).
 *
 * Implements the SAME public contract as sapoShippingService so the shippingService
 * facade can dispatch to either: createShipmentForOrder, calculateShippingRate,
 * trackItems, cancelShipment, markAsDelivered, updateMailItemEvent, generateTrackingNumber.
 *
 * Auth: Bearer token (SHIPLOGIC_API_KEY). Base: SHIPLOGIC_BASE_URL. Set SHIPLOGIC_MOCK_MODE=true
 * to exercise the flow without calling the live API.
 *
 * NOTE: ShipLogic response field names below are coded defensively (multiple fallbacks)
 * because the Postman collection ships no response-body examples — confirm against a real
 * sandbox response and tighten the mapping when keys are known.
 */
class ShipLogicShippingService {
  constructor() {
    this.mock = process.env.SHIPLOGIC_MOCK_MODE === 'true';
    this.apiKey = process.env.SHIPLOGIC_API_KEY || '';
    this.baseUrl = (process.env.SHIPLOGIC_BASE_URL || 'https://api.shiplogic.com').replace(/\/+$/, '');
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    });
  }

  headers() {
    return { Authorization: `Bearer ${this.apiKey}` };
  }

  isConfigured() {
    return this.mock || !!this.apiKey;
  }

  today() {
    // YYYY-MM-DD for collection/delivery min dates
    return new Date().toISOString().slice(0, 10);
  }

  // ---- Address mapping -------------------------------------------------------
  buildCollectionAddress(order) {
    const seller = order.seller || {};
    const pickup = order.pickup || {};
    return {
      address: {
        type: 'business',
        company: seller.name || 'Quicksell Seller',
        street_address: pickup.address || order.pickupLocation || '',
        local_area: pickup.suburb || '',
        city: pickup.city || '',
        zone: pickup.province || 'Gauteng',
        country: 'ZA',
        code: pickup.postalCode || seller.postalCode || '',
      },
      contact: {
        name: seller.name || `${seller.firstName || ''} ${seller.lastName || ''}`.trim() || 'Quicksell Seller',
        mobile_number: seller.phone || '',
        email: seller.email || 'seller@quicksell.co.za',
      },
    };
  }

  buildDeliveryAddress(order) {
    const s = order.shippingInfo || order.shippingAddress || {};
    return {
      address: {
        type: 'residential',
        company: '',
        street_address: s.address || '',
        local_area: s.suburb || '',
        city: s.city || '',
        zone: s.province || 'Gauteng',
        country: 'ZA',
        code: s.postalCode || '',
      },
      contact: {
        name: s.fullName || order.buyerName || 'Customer',
        mobile_number: s.phone || order.buyerPhone || '',
        email: s.email || order.buyerEmail || '',
      },
    };
  }

  async buildParcels(order) {
    // Prefer dimensions carried on the order; otherwise fetch the product; else defaults.
    let productLike = { dimensions: order.dimensions, weight: order.weight || order.productWeight };
    if (!order.dimensions && order.productId && db) {
      try {
        const pdoc = await db.collection('products').doc(order.productId).get();
        if (pdoc.exists) productLike = pdoc.data();
      } catch (e) {
        console.warn('ShipLogic: product fetch for dimensions failed:', e.message);
      }
    }
    const dims = getParcelDimensions(productLike);
    const qty = Math.max(1, Number(order.quantity) || 1);
    const weight = Number(order.weight || order.productWeight || productLike.weight || 1);
    const parcel = {
      parcel_description: order.productTitle || 'Item',
      submitted_length_cm: dims.length,
      submitted_width_cm: dims.width,
      submitted_height_cm: dims.height,
      submitted_weight_kg: weight,
    };
    // One line per unit (keeps total weight/volume correct for multi-quantity sale orders)
    return Array.from({ length: qty }, () => ({ ...parcel }));
  }

  // ---- Rates -----------------------------------------------------------------
  /**
   * Quote a delivery. Accepts either an `order`-like object or explicit
   * { collection, delivery, parcels, declared_value }. Returns the standard shape
   * used across the app plus ShipLogic specifics (rateId, serviceLevel).
   */
  async calculateShippingRate(params) {
    const collection = params.collection || this.buildCollectionAddress(params).address;
    const delivery = params.delivery || this.buildDeliveryAddress(params).address;
    const parcels = params.parcels || (await this.buildParcels(params));
    const declaredValue = Number(params.declared_value || params.value || params.amount || 100);

    if (this.mock) {
      const total = 95 + parcels.reduce((s, p) => s + Number(p.submitted_weight_kg || 1) * 12, 0);
      return this.formatRate({ id: 0, rate: total, service_level: { name: 'Economy', code: 'ECO' } }, true);
    }

    const body = {
      collection_address: collection,
      delivery_address: delivery,
      parcels,
      declared_value: declaredValue,
      collection_min_date: this.today(),
      delivery_min_date: this.today(),
    };
    const res = await this.client.post('/rates', body, { headers: this.headers() });
    const rates = (res.data && (res.data.rates || res.data.data || res.data)) || [];
    const list = Array.isArray(rates) ? rates : [];
    if (list.length === 0) {
      throw new Error('ShipLogic returned no rates for this route');
    }
    // Cheapest rate
    const priceOf = (r) => Number(r.rate || r.total || r.charged_amount || r.base_rate || 0);
    const cheapest = list.slice().sort((a, b) => priceOf(a) - priceOf(b))[0];
    return this.formatRate(cheapest, false);
  }

  formatRate(r, isMock) {
    const total = Number(r.rate || r.total || r.charged_amount || r.base_rate || 0);
    const serviceLevel = (r.service_level && (r.service_level.name || r.service_level.code)) || r.service_level_code || 'Standard';
    return {
      success: true,
      currency: 'ZAR',
      provider: 'shiplogic',
      rateId: r.id != null ? r.id : (r.rate_id != null ? r.rate_id : null),
      serviceLevel,
      breakdown: { baseRate: total, weightCharge: 0, distanceCharge: 0, expressCharge: 0 },
      total,
      estimatedDays: r.estimated_delivery_days || r.delivery_days || '1-3',
      mock: !!isMock,
    };
  }

  // ---- Create shipment -------------------------------------------------------
  async createShipmentForOrder(order) {
    const shipping = order.shippingInfo || order.shippingAddress || {};
    if (!shipping.fullName || !shipping.address || !shipping.city || !shipping.postalCode) {
      throw new Error('Incomplete shipping information. Required: fullName, address, city, postalCode');
    }

    const collection = this.buildCollectionAddress(order);
    const delivery = this.buildDeliveryAddress(order);
    const parcels = await this.buildParcels(order);
    const declaredValue = Number(order.amount || order.totalAmount || 100);

    // Reuse the rate chosen at checkout when available, else quote now.
    let rateId = order.shipmentRate && order.shipmentRate.rateId != null ? order.shipmentRate.rateId : null;
    if (rateId == null && !this.mock) {
      try {
        const quoted = await this.calculateShippingRate({
          collection: collection.address, delivery: delivery.address, parcels, declared_value: declaredValue,
        });
        rateId = quoted.rateId;
      } catch (e) {
        console.warn('ShipLogic: re-quote at shipment time failed:', e.message);
      }
    }

    let trackingNumber, shipmentId, submitResponse;
    if (this.mock) {
      trackingNumber = `SL${Date.now()}`;
      shipmentId = null;
      submitResponse = { mock: true };
    } else {
      const body = {
        collection_address: collection.address,
        collection_contact: collection.contact,
        delivery_address: delivery.address,
        delivery_contact: delivery.contact,
        parcels,
        declared_value: declaredValue,
        opt_in_rates: [],
        opt_in_time_based_rates: rateId != null ? [rateId] : [],
        collection_min_date: this.today(),
        delivery_min_date: this.today(),
        special_instructions_collection: '',
        special_instructions_delivery: '',
      };
      const res = await this.client.post('/shipments', body, { headers: this.headers() });
      const data = (res.data && (res.data.data || res.data)) || {};
      trackingNumber = data.short_tracking_reference || data.tracking_reference || data.custom_tracking_reference || String(data.id || '');
      shipmentId = data.id != null ? data.id : null;
      submitResponse = data;
      if (!trackingNumber) throw new Error('ShipLogic: no tracking reference returned');
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
        carrier: 'ShipLogic',
        shiplogicShipmentId: shipmentId,
        status: 'shipped',
        currentStatus: 'Order Shipped',
        weight: Number(order.weight || order.productWeight || 1),
        value: declaredValue,
        shippingCost: Number(order.shippingCost || (order.shipmentRate && order.shipmentRate.total) || 0),
        express: false,
        senderCity: collection.address.city,
        senderProvince: collection.address.zone,
        recipientCity: delivery.address.city,
        recipientProvince: delivery.address.zone,
        createdAt: ts,
        updatedAt: ts,
        shippedAt: ts,
        events: [{
          code: 'created',
          status: 'Order Shipped',
          description: 'Shipment created with ShipLogic',
          timestamp: new Date().toISOString(),
          office: 'Quicksell',
          officeName: 'Quicksell',
        }],
        isMock: this.mock,
      });
    }

    return { success: true, trackingNumber, customerRef: order.id, carrier: 'ShipLogic', submitResponse };
  }

  // ---- Tracking --------------------------------------------------------------
  async trackItems(trackingNumbers) {
    const arr = Array.isArray(trackingNumbers) ? trackingNumbers : [trackingNumbers];
    const items = [];
    for (const tn of arr) {
      try {
        items.push(await this.trackOne(tn));
      } catch (e) {
        console.warn('ShipLogic track error for', tn, e.message);
        items.push({ trackingNumber: tn, currentStatus: 'Unknown', events: [], error: e.message });
      }
    }
    return { success: true, items };
  }

  async trackOne(trackingNumber) {
    if (this.mock) {
      return {
        trackingNumber, weight: 1,
        origin: { country: 'ZA', code: '' }, destination: { country: 'ZA', code: '' },
        characteristics: { express: false, exempt: false, insured: { amount: 0, currency: 'ZAR' } },
        events: [{ code: 'created', description: 'Shipment created', office: '', officeCode: '', timestamp: new Date().toISOString(), status: 'Order Shipped' }],
        currentStatus: 'Order Shipped', lastUpdate: new Date().toISOString(),
      };
    }
    const res = await this.client.get('/tracking/shipments', {
      headers: this.headers(),
      params: { tracking_reference: trackingNumber },
    });
    const data = (res.data && (res.data.data || res.data)) || {};
    const rawEvents = data.tracking_events || data.events || [];
    const events = rawEvents.map(ev => ({
      code: ev.status || ev.code || '',
      description: ev.message || ev.description || ev.status || '',
      office: ev.hub || ev.source_hub || '',
      officeCode: '',
      timestamp: ev.date || ev.event_time || ev.time || '',
      status: this.mapStatus(ev.status || ev.code || ''),
    }));
    return {
      trackingNumber,
      weight: data.weight || 1,
      origin: { country: 'ZA', code: data.collection_hub || '' },
      destination: { country: 'ZA', code: data.delivery_hub || '' },
      characteristics: { express: false, exempt: false, insured: { amount: data.declared_value || 0, currency: 'ZAR' } },
      events,
      currentStatus: this.mapStatus(data.status || (events[events.length - 1] && events[events.length - 1].code) || ''),
      lastUpdate: data.time_modified || (events[events.length - 1] && events[events.length - 1].timestamp) || null,
    };
  }

  /** Map ShipLogic status codes to the customer-facing statuses used across the app. */
  mapStatus(code) {
    const c = String(code || '').toLowerCase();
    if (c.includes('delivered')) return 'Delivered';
    if (c.includes('out-for-delivery') || c.includes('out for delivery')) return 'Out for Delivery';
    if (c.includes('in-transit') || c.includes('in transit') || c.includes('dispatch')) return 'In Transit';
    if (c.includes('at-destination-hub') || c.includes('at-hub') || c.includes('hub')) return 'At Sorting Facility';
    if (c.includes('collected')) return 'Collected';
    if (c.includes('cancel')) return 'Cancelled';
    if (c.includes('return')) return 'Returned to Sender';
    if (c.includes('on-hold') || c.includes('hold')) return 'On Hold';
    if (c.includes('failed') || c.includes('exception')) return 'Delivery Failed';
    return 'Order Shipped';
  }

  // ---- Cancel ----------------------------------------------------------------
  async cancelShipment(trackingNumber, reason = 'Customer request') {
    if (this.mock) return { success: true, data: { mock: true } };
    const res = await this.client.post('/shipments/cancel', { tracking_reference: trackingNumber }, { headers: this.headers() });
    return { success: true, data: res.data };
  }

  // ---- Provider-difference no-ops -------------------------------------------
  // ShipLogic delivers status via webhooks and returns the tracking ref on create,
  // so these SAPO-specific operations have no merchant-side ShipLogic equivalent.
  async markAsDelivered(trackingNumber, signature) {
    return { success: true, data: { note: 'ShipLogic delivery status is courier/webhook driven; no-op' } };
  }

  async updateMailItemEvent(trackingNumber, eventCode, additionalData = {}) {
    return { success: true, data: { note: 'ShipLogic does not accept merchant-pushed events; no-op' } };
  }

  async generateTrackingNumber(customerRef) {
    // ShipLogic assigns the tracking reference when the shipment is created.
    return { success: true, customerRef, trackingNumber: null, deferred: true };
  }

  async submitMailItem() {
    throw new Error('submitMailItem is SAPO-specific; ShipLogic uses createShipmentForOrder');
  }
}

module.exports = new ShipLogicShippingService();
