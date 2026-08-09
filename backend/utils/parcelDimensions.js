/**
 * Resolve parcel dimensions (inches) for a product.
 *
 * USPS and UPS both require submitted L/W/H on rate and label calls. Products may
 * carry an optional `dimensions { length, width, height }`; when absent (legacy
 * listings or sellers who skip it) we fall back to sensible defaults by weight tier
 * so the item can still ship.
 *
 * PARCEL_MAX_DIM_IN (108") is the longest single dimension either parcel carrier
 * accepts; shipmentRecord.requiresFreight() uses it to route oversized items to
 * freight. The sanity bound below is deliberately much larger so that a genuinely
 * oversized machine's real dimensions survive validation and TRIGGER that freight
 * check, rather than being discarded as invalid and replaced by small defaults.
 */
const PARCEL_MAX_DIM_IN = 108;
const SANE_MAX_DIM_IN = 1000;

const WEIGHT_TIERS = [
  { maxLbs: 2, length: 10, width: 8, height: 2 },     // flyer / small
  { maxLbs: 7, length: 12, width: 10, height: 6 },
  { maxLbs: 12, length: 14, width: 12, height: 8 },
  { maxLbs: 25, length: 16, width: 14, height: 12 },
  { maxLbs: 70, length: 20, width: 16, height: 16 },
  { maxLbs: Infinity, length: 24, width: 20, height: 20 },
];

function defaultsForWeight(weightLbs) {
  const w = Number(weightLbs) || 1;
  const tier = WEIGHT_TIERS.find(t => w <= t.maxLbs) || WEIGHT_TIERS[WEIGHT_TIERS.length - 1];
  return { length: tier.length, width: tier.width, height: tier.height };
}

function isValidDim(v) {
  return typeof v === 'number' && isFinite(v) && v > 0 && v <= SANE_MAX_DIM_IN;
}

function getParcelDimensions(product) {
  const d = product && product.dimensions;
  if (d && isValidDim(Number(d.length)) && isValidDim(Number(d.width)) && isValidDim(Number(d.height))) {
    return { length: Number(d.length), width: Number(d.width), height: Number(d.height) };
  }
  return defaultsForWeight(product && (product.weight || product.productWeight));
}

module.exports = { getParcelDimensions, defaultsForWeight, PARCEL_MAX_DIM_IN, SANE_MAX_DIM_IN };
