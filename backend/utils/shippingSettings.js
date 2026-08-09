const { db } = require('../config/firebase');

/**
 * Active courier provider for the platform.
 *
 * Stored by the admin in settings/shipping.activeProvider ('usps' | 'ups' | 'freight').
 * Read on the shipment hot-path, so we cache it for a short TTL to avoid a
 * Firestore read per shipment. A toggle change therefore applies within ~TTL.
 */
const TTL_MS = 60 * 1000;
const VALID_PROVIDERS = ['usps', 'ups', 'freight'];
const DEFAULT_PROVIDER = 'usps';

let cache = { provider: null, at: 0 };

async function getActiveShippingProvider() {
  const now = Date.now();
  if (cache.provider && now - cache.at < TTL_MS) return cache.provider;

  let provider = DEFAULT_PROVIDER;
  try {
    if (db) {
      const doc = await db.collection('settings').doc('shipping').get();
      const raw = doc.exists ? String(doc.data().activeProvider || '').toLowerCase() : '';
      provider = VALID_PROVIDERS.includes(raw) ? raw : DEFAULT_PROVIDER;
    }
  } catch (e) {
    console.warn(`shippingSettings: failed reading active provider, defaulting to ${DEFAULT_PROVIDER}:`, e.message);
    provider = DEFAULT_PROVIDER;
  }

  cache = { provider, at: now };
  return provider;
}

function isValidProvider(name) {
  return VALID_PROVIDERS.includes(String(name || '').toLowerCase());
}

// Call after the admin updates the setting so the change is reflected immediately.
function clearShippingProviderCache() {
  cache = { provider: null, at: 0 };
}

module.exports = {
  getActiveShippingProvider,
  isValidProvider,
  clearShippingProviderCache,
  VALID_PROVIDERS,
  DEFAULT_PROVIDER,
};
