const { db } = require('../config/firebase');
const { getActiveShippingProvider } = require('../utils/shippingSettings');

/**
 * Shipping provider facade.
 *
 * All routes import THIS instead of a concrete provider. It dispatches:
 *  - CREATE-side calls (new shipments/quotes) → the platform's *active* provider
 *    (admin toggle, settings/shipping.activeProvider).
 *  - EXISTING-shipment calls (track/cancel/deliver/event) → the provider that
 *    actually created that shipment (its stored `carrier`), NOT the global toggle —
 *    so parcels already shipped on SAPO keep working after switching to ShipLogic.
 *
 * Both concrete providers (sapoShippingService, shiplogicShippingService) expose the
 * same method names and write the same order/`shipments` field contract.
 */
function providerByName(name) {
  // lazy require so a provider's module/env only loads when actually used
  if (name === 'shiplogic') return require('./shiplogicShippingService');
  if (name === 'rtt') return require('./rttShippingService');
  if (name === 'pargo') return require('./pargoShippingService');
  return require('./sapoShippingService');
}

async function activeProvider() {
  return providerByName(await getActiveShippingProvider());
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
        if (carrier === 'shiplogic') return 'shiplogic';
        if (carrier === 'rtt') return 'rtt';
        if (carrier === 'pargo') return 'pargo';
        return 'sapo';
      }
    }
  } catch (e) {
    console.warn('shippingService: carrier lookup failed for', trackingNumber, e.message);
  }
  return 'sapo';
}

module.exports = {
  // ---- create-side → active provider ----
  async createShipmentForOrder(order) {
    return (await activeProvider()).createShipmentForOrder(order);
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
      const carrier = name === 'shiplogic' ? 'ShipLogic' : name === 'rtt' ? 'RTT' : name === 'pargo' ? 'Pargo' : 'SAPO';
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
