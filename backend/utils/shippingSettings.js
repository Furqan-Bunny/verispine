const { db } = require('../config/firebase');

/**
 * Active courier provider for the platform.
 *
 * Stored by the admin in settings/shipping.activeProvider ('sapo' | 'shiplogic').
 * Read on the shipment hot-path, so we cache it for a short TTL to avoid a
 * Firestore read per shipment. A toggle change therefore applies within ~TTL.
 */
const TTL_MS = 60 * 1000;
let cache = { provider: null, at: 0 };

async function getActiveShippingProvider() {
  const now = Date.now();
  if (cache.provider && now - cache.at < TTL_MS) return cache.provider;

  let provider = 'sapo';
  try {
    if (db) {
      const doc = await db.collection('settings').doc('shipping').get();
      const raw = doc.exists ? String(doc.data().activeProvider || '').toLowerCase() : '';
      provider = (raw === 'shiplogic' || raw === 'rtt' || raw === 'pargo') ? raw : 'sapo';
    }
  } catch (e) {
    console.warn('shippingSettings: failed reading active provider, defaulting to sapo:', e.message);
    provider = 'sapo';
  }

  cache = { provider, at: now };
  return provider;
}

async function isShipLogicActive() {
  return (await getActiveShippingProvider()) === 'shiplogic';
}

async function isPargoActive() {
  return (await getActiveShippingProvider()) === 'pargo';
}

// Nationwide couriers deliver anywhere, so the same-city purchase restriction is bypassed for them.
async function isNationwideCourierActive() {
  const p = await getActiveShippingProvider();
  return p === 'shiplogic' || p === 'rtt' || p === 'pargo';
}

// Call after the admin updates the setting so the change is reflected immediately.
function clearShippingProviderCache() {
  cache = { provider: null, at: 0 };
}

module.exports = { getActiveShippingProvider, isShipLogicActive, isPargoActive, isNationwideCourierActive, clearShippingProviderCache };
