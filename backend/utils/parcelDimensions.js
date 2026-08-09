/**
 * Resolve parcel dimensions (cm) for a product.
 *
 * ShipLogic's rates/shipments API requires submitted L/W/H. Products may carry an
 * optional `dimensions { length, width, height }`; when absent (legacy listings or
 * sellers who skip it) we fall back to sensible defaults by weight tier so the item
 * can still ship. SAPO ignores dimensions entirely.
 */
const WEIGHT_TIERS = [
  { maxKg: 1, length: 25, width: 20, height: 5 },   // flyer / small
  { maxKg: 3, length: 30, width: 25, height: 15 },
  { maxKg: 5, length: 35, width: 30, height: 20 },
  { maxKg: 10, length: 40, width: 35, height: 30 },
  { maxKg: Infinity, length: 50, width: 40, height: 40 },
];

function defaultsForWeight(weightKg) {
  const w = Number(weightKg) || 1;
  const tier = WEIGHT_TIERS.find(t => w <= t.maxKg) || WEIGHT_TIERS[WEIGHT_TIERS.length - 1];
  return { length: tier.length, width: tier.width, height: tier.height };
}

function isValidDim(v) {
  return typeof v === 'number' && isFinite(v) && v > 0 && v <= 200;
}

function getParcelDimensions(product) {
  const d = product && product.dimensions;
  if (d && isValidDim(Number(d.length)) && isValidDim(Number(d.width)) && isValidDim(Number(d.height))) {
    return { length: Number(d.length), width: Number(d.width), height: Number(d.height) };
  }
  return defaultsForWeight(product && (product.weight || product.productWeight));
}

module.exports = { getParcelDimensions, defaultsForWeight };
