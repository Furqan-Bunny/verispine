const { admin, db } = require('../config/firebase');
const record = require('./shipmentRecord');
const { FREIGHT_THRESHOLD_LBS } = require('../utils/locale');

/**
 * Freight / LTL provider — for medical machinery that cannot move as a parcel.
 *
 * Unlike USPS and UPS this is not an API integration: LTL carriers quote per
 * lane and per commodity, so the flow is seller-quoted and admin-tracked. The
 * service still implements the full 8-method contract so the facade, the
 * payment pipeline and the tracking UI treat it like any other carrier.
 *
 * Because there is no carrier API pushing events, `updateMailItemEvent` is the
 * REAL mechanism here (an admin advancing the shipment), not a no-op like it is
 * for the parcel carriers.
 */

const STATUS_BY_CODE = {
  booked: 'Order Shipped',
  picked_up: 'Collected',
  in_transit: 'In Transit',
  at_terminal: 'In Transit',
  out_for_delivery: 'Out for Delivery',
  delivery_scheduled: 'Out for Delivery',
  delivered: 'Delivered',
  failed: 'Delivery Failed',
  returned: 'Returned to Sender',
};

class FreightQuoteService {
  constructor() {
    // A published estimate only; the binding number is the seller's/carrier's quote.
    this.baseRate = Number(process.env.FREIGHT_BASE_RATE || 185);
    this.perLb = Number(process.env.FREIGHT_RATE_PER_LB || 0.42);
    this.liftgateFee = Number(process.env.FREIGHT_LIFTGATE_FEE || 95);
    this.residentialFee = Number(process.env.FREIGHT_RESIDENTIAL_FEE || 120);
  }

  isConfigured() {
    return true; // no credentials needed — this path is always available
  }

  /**
   * Dimensional weight at the LTL standard (L×W×H / 139 for air, /250 for LTL
   * ground). Carriers bill the greater of actual and dimensional weight.
   */
  billableWeight(parcels) {
    const actual = record.totalWeight(parcels);
    const dim = parcels.reduce(
      (sum, p) => sum + (Number(p.lengthIn) * Number(p.widthIn) * Number(p.heightIn)) / 250,
      0
    );
    return Math.max(actual, Math.round(dim * 10) / 10);
  }

  // ---- Rates ---------------------------------------------------------------

  /**
   * An indicative estimate. `requiresQuote` tells checkout to present this as an
   * estimate pending a firm quote rather than as a charged amount — never quote
   * freight as final, because the real number depends on the lane.
   */
  async calculateShippingRate(params = {}) {
    const parcels = params.parcels || record.buildParcels(params, params.product || {});
    const weight = this.billableWeight(parcels);
    const residential = params.residential !== false;
    const liftgate = params.liftgate !== false; // assume needed unless a dock is confirmed

    let total = this.baseRate + weight * this.perLb;
    if (liftgate) total += this.liftgateFee;
    if (residential) total += this.residentialFee;
    total = Math.round(total * 100) / 100;

    return {
      success: true,
      currency: 'USD',
      provider: 'freight',
      rateId: null,
      serviceLevel: 'LTL Freight (estimate)',
      breakdown: {
        base: this.baseRate,
        perLb: this.perLb,
        billableWeight: weight,
        liftgate: liftgate ? this.liftgateFee : 0,
        residential: residential ? this.residentialFee : 0,
      },
      total,
      estimatedDays: '5-10',
      requiresQuote: true,
      mock: false,
    };
  }

  // ---- Create shipment -----------------------------------------------------

  /**
   * "Creating" a freight shipment books it internally and issues a VeriSpine
   * reference. The seller arranges the carrier and the admin records the real
   * pro number via updateMailItemEvent once it exists.
   */
  async createShipmentForOrder(order) {
    const shipping = order.shippingInfo || order.shippingAddress || {};
    if (!shipping.fullName || !shipping.address || !shipping.city || !shipping.postalCode) {
      throw new Error('Incomplete shipping information. Required: fullName, address, city, postalCode');
    }

    const { trackingNumber } = await this.generateTrackingNumber(order.id);
    const { product } = await record.loadContext(order);
    const parcels = record.buildParcels(order, product);

    await record.saveShipment(order, {
      trackingNumber,
      carrier: 'Freight',
      service: 'LTL Freight',
      status: 'awaiting_pickup',
      currentStatus: 'Order Shipped',
      eventDescription: 'Freight shipment booked — awaiting carrier pickup',
      extra: {
        requiresQuote: true,
        billableWeight: this.billableWeight(parcels),
        proNumber: null, // filled in by the admin once the carrier assigns one
      },
    });

    return { success: true, trackingNumber, customerRef: order.id, carrier: 'Freight', labelUrl: null };
  }

  // ---- Tracking ------------------------------------------------------------

  /**
   * Freight tracking reads back what the admin recorded — the shipments doc IS
   * the source of truth here, since no carrier is pushing to us.
   */
  async trackItems(trackingNumbers) {
    const arr = Array.isArray(trackingNumbers) ? trackingNumbers : [trackingNumbers];
    const items = [];

    for (const tn of arr) {
      let ship = null;
      try {
        if (db) {
          const snap = await db.collection('shipments').where('trackingNumber', '==', tn).limit(1).get();
          if (!snap.empty) ship = snap.docs[0].data();
        }
      } catch (e) {
        console.warn('Freight track lookup failed for', tn, e.message);
      }

      const events = (ship && ship.events) || [];
      const last = events[events.length - 1];
      items.push({
        trackingNumber: tn,
        weight: (ship && ship.weight) || 0,
        origin: { country: 'US', code: (ship && ship.senderState) || '' },
        destination: { country: 'US', code: (ship && ship.recipientState) || '' },
        characteristics: { express: false, exempt: false, insured: { amount: (ship && ship.value) || 0, currency: 'USD' } },
        events,
        currentStatus: (ship && ship.currentStatus) || 'Order Shipped',
        lastUpdate: last ? last.timestamp : null,
        proNumber: (ship && ship.proNumber) || null,
      });
    }

    return { success: true, items };
  }

  mapStatus(code) {
    const key = String(code || '').toLowerCase().replace(/[\s-]+/g, '_');
    return STATUS_BY_CODE[key] || 'In Transit';
  }

  // ---- Manual event push (the primary mechanism for freight) ----------------

  /**
   * Record a milestone against a freight shipment. `additionalData.proNumber`
   * stores the carrier's real pro number the first time it is known.
   */
  async updateMailItemEvent(trackingNumber, eventCode, additionalData = {}) {
    if (!db) throw new Error('Database connection unavailable');

    const snap = await db.collection('shipments').where('trackingNumber', '==', trackingNumber).limit(1).get();
    if (snap.empty) throw new Error(`No freight shipment found for ${trackingNumber}`);

    const doc = snap.docs[0];
    const status = this.mapStatus(eventCode);
    const timestamp = additionalData.timestamp || new Date().toISOString();
    const ts = admin ? admin.firestore.FieldValue.serverTimestamp() : new Date();

    const event = {
      code: String(eventCode || ''),
      status,
      description: additionalData.description || String(eventCode || ''),
      timestamp,
      office: additionalData.location || '',
      officeName: additionalData.carrierName || 'Freight',
    };

    const update = {
      events: admin ? admin.firestore.FieldValue.arrayUnion(event) : [event],
      currentStatus: status,
      updatedAt: ts,
    };
    if (additionalData.proNumber) update.proNumber = String(additionalData.proNumber);
    if (additionalData.carrierName) update.freightCarrier = String(additionalData.carrierName);

    await doc.ref.update(update);
    return { success: true, data: { trackingNumber, status, event } };
  }

  async markAsDelivered(trackingNumber, signature) {
    return this.updateMailItemEvent(trackingNumber, 'delivered', {
      description: signature ? `Delivered — signed for by ${signature}` : 'Delivered',
    });
  }

  async cancelShipment(trackingNumber, reason = 'Customer request') {
    if (!db) throw new Error('Database connection unavailable');
    const snap = await db.collection('shipments').where('trackingNumber', '==', trackingNumber).limit(1).get();
    if (snap.empty) throw new Error(`No freight shipment found for ${trackingNumber}`);

    const ts = admin ? admin.firestore.FieldValue.serverTimestamp() : new Date();
    await snap.docs[0].ref.update({ status: 'cancelled', cancelReason: reason, cancelledAt: ts, updatedAt: ts });
    return { success: true, data: { trackingNumber, cancelled: true, reason } };
  }

  /**
   * VeriSpine-issued reference: VSF + a base36 timestamp + a per-order suffix so
   * two orders booked in the same millisecond can't collide.
   */
  async generateTrackingNumber(customerRef) {
    const stamp = Date.now().toString(36).toUpperCase();
    const suffix = String(customerRef || '').replace(/[^A-Za-z0-9]/g, '').slice(-4).toUpperCase() || 'XXXX';
    return { success: true, customerRef, trackingNumber: `VSF${stamp}${suffix}` };
  }

  async submitMailItem() {
    throw new Error('submitMailItem is not used by freight; use createShipmentForOrder');
  }
}

module.exports = new FreightQuoteService();
