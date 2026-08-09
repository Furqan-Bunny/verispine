const { db } = require('../config/firebase');
const { getActiveShippingProvider } = require('../utils/shippingSettings');
const record = require('./shipmentRecord');

/**
 * Shipping provider facade.
 *
 * All routes import THIS instead of a concrete provider. It dispatches:
 *  - CREATE-side calls (new shipments/quotes) → the platform's *active* provider
 *    (admin toggle, settings/shipping.activeProvider) — except when the order is
 *    too heavy or too large for parcel service, in which case it is forced onto
 *    freight regardless of the toggle.
 *  - EXISTING-shipment calls (track/cancel/deliver/event) → the provider that
 *    actually created that shipment (its stored `carrier`), NOT the global toggle —
 *    so parcels already shipped on USPS keep working after switching to UPS.
 *
 * Every provider exposes the same method names and writes the same
 * order/`shipments` field contract (see shipmentRecord.js).
 */
const PROVIDERS = ['usps', 'ups', 'freight'];

function providerByName(name) {
  // lazy require so a provider's module/env only loads when actually used
  if (name === 'ups') return require('./upsShippingService');
  if (name === 'freight') return require('./freightQuoteService');
  return require('./uspsShippingService');
}

async function activeProvider() {
  return providerByName(await getActiveShippingProvider());
}

/**
 * Pick the provider for a NEW shipment.
 *
 * Medical machinery routinely exceeds parcel limits, and a parcel carrier will
 * simply reject those bookings. Rather than fail the order after payment, route
 * anything over the freight threshold to the freight path automatically.
 */
async function providerForOrder(order) {
  const active = await getActiveShippingProvider();
  if (active === 'freight') return { name: 'freight', service: providerByName('freight') };

  try {
    const { product } = await record.loadContext(order);
    if (record.requiresFreight(record.buildParcels(order, product))) {
      console.log(`shippingService: order ${order.id} exceeds parcel limits — routing to freight`);
      return { name: 'freight', service: providerByName('freight') };
    }
  } catch (e) {
    console.warn('shippingService: freight check failed, using active provider:', e.message);
  }

  return { name: active, service: providerByName(active) };
}

// Resolve which provider owns an existing shipment, by its stored carrier.
async function carrierForTracking(trackingNumber) {
  try {
    if (db && trackingNumber) {
      const snap = await db.collection('shipments')
        .where('trackingNumber', '==', trackingNumber)
        .limit(1)
        .get();
      if (!snap.empty) {
        const carrier = String(snap.docs[0].data().carrier || '').toLowerCase();
        if (carrier === 'ups') return 'ups';
        if (carrier === 'freight') return 'freight';
        return 'usps';
      }
    }
  } catch (e) {
    console.warn('shippingService: carrier lookup failed for', trackingNumber, e.message);
  }
  return 'usps';
}

const CARRIER_LABEL = { usps: 'USPS', ups: 'UPS', freight: 'Freight' };

module.exports = {
  PROVIDERS,
  providerByName,

  // ---- create-side → active provider (or freight, when the order demands it) ----
  async createShipmentForOrder(order) {
    const { service } = await providerForOrder(order);
    return service.createShipmentForOrder(order);
  },
  async calculateShippingRate(params) {
    return (await activeProvider()).calculateShippingRate(params);
  },
  async generateTrackingNumber(customerRef) {
    return (await activeProvider()).generateTrackingNumber(customerRef);
  },
  async submitMailItem(itemData) {
    return (await activeProvider()).submitMailItem(itemData);
  },

  // ---- existing-shipment-side → provider by shipment carrier ----
  async trackItems(trackingNumbers) {
    const arr = Array.isArray(trackingNumbers) ? trackingNumbers : [trackingNumbers];
    // Group by carrier so mixed-fleet batches each hit the right provider.
    const groups = new Map();
    for (const tn of arr) {
      const c = await carrierForTracking(tn);
      if (!groups.has(c)) groups.set(c, []);
      groups.get(c).push(tn);
    }
    let items = [];
    for (const [name, tns] of groups) {
      const res = await providerByName(name).trackItems(tns);
      const carrier = CARRIER_LABEL[name] || 'USPS';
      if (res && Array.isArray(res.items)) {
        items = items.concat(res.items.map(it => ({ carrier, ...it })));
      }
    }
    return { success: true, items };
  },
  async updateMailItemEvent(trackingNumber, eventCode, additionalData = {}) {
    return providerByName(await carrierForTracking(trackingNumber))
      .updateMailItemEvent(trackingNumber, eventCode, additionalData);
  },
  async cancelShipment(trackingNumber, reason) {
    return providerByName(await carrierForTracking(trackingNumber))
      .cancelShipment(trackingNumber, reason);
  },
  async markAsDelivered(trackingNumber, signature) {
    return providerByName(await carrierForTracking(trackingNumber))
      .markAsDelivered(trackingNumber, signature);
  },
};
