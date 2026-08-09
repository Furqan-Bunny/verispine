/**
 * City-based purchase restriction (TEMPORARY — stopgap until DHL/nationwide courier).
 *
 * Quicksell currently only fulfils orders within its operating cities. Each product
 * is tied to one supported city (product.pickupCity); only buyers in that same city
 * may bid or buy. This whole module is meant to be deleted once nationwide delivery
 * is integrated — disable instantly with CITY_RESTRICTION_ENABLED=false.
 */

// Keep this list in sync with frontend/src/config/cities.ts
const SUPPORTED_CITIES = [
  'Alberton', 'Ballito', 'Bela-Bela', 'Bellville', 'Benoni', 'Bethlehem',
  'Bloemfontein', 'Boksburg', 'Brits', 'Cape Town', 'Centurion', 'Durban',
  'East London', 'Empangeni', 'George', 'Germiston', 'Gqeberha', 'Hermanus',
  'Johannesburg', 'Kempton Park', 'Kimberley', 'Klerksdorp', 'Knysna',
  'Kroonstad', 'Krugersdorp', 'Ladysmith', 'Mahikeng', 'Margate', 'Mbombela',
  'Middelburg', 'Midrand', 'Mokopane', 'Mossel Bay', 'Mthatha', 'Musina',
  'Newcastle', 'Oudtshoorn', 'Paarl', 'Phuthaditjhaba', 'Pietermaritzburg',
  'Pinetown', 'Polokwane', 'Port Elizabeth', 'Potchefstroom', 'Pretoria',
  'Queenstown', 'Randburg', 'Richards Bay', 'Roodepoort', 'Rustenburg',
  'Sandton', 'Sasolburg', 'Secunda', 'Somerset West', 'Soweto', 'Springbok',
  'Springs', 'Standerton', 'Stellenbosch', 'Thohoyandou', 'Tzaneen',
  'Uitenhage', 'Umhlanga', 'Upington', 'Vanderbijlpark', 'Vereeniging',
  'Welkom', 'White River', 'Witbank', 'Worcester',
];

// Default ON. Set CITY_RESTRICTION_ENABLED=false in env to bypass all checks.
const CITY_RESTRICTION_ENABLED = process.env.CITY_RESTRICTION_ENABLED !== 'false';

function normalizeCity(city) {
  return String(city || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

function isCityServiceable(city) {
  const n = normalizeCity(city);
  return SUPPORTED_CITIES.some(c => normalizeCity(c) === n);
}

function citiesMatch(a, b) {
  const na = normalizeCity(a);
  const nb = normalizeCity(b);
  return na !== '' && na === nb;
}

/**
 * Resolve a product's delivery city. The backend stores it as shipping.pickupCity
 * (nested) and as a "City, Province" location string — NOT a top-level pickupCity.
 * Resolve from any of those. "South Africa" (the legacy default) counts as no city.
 */
function getProductCity(product) {
  if (!product) return '';
  if (product.pickupCity) return product.pickupCity;
  if (product.shipping && product.shipping.pickupCity) return product.shipping.pickupCity;
  if (product.location && normalizeCity(product.location) !== 'south africa') {
    return String(product.location).split(',')[0].trim();
  }
  return '';
}

/**
 * Decide whether a buyer in `buyerCity` may transact on `product`.
 * @returns {{ allowed: boolean, productCity: string|null, reason: string|null }}
 *   reason values: null (allowed), 'no-buyer-city', 'city-mismatch'
 */
function checkCityRestriction(product, buyerCity) {
  const productCity = getProductCity(product) || null;

  // Feature flag off → never restrict
  if (!CITY_RESTRICTION_ENABLED) {
    return { allowed: true, productCity, reason: null };
  }

  // Legacy products without a city → unrestricted (backward compat)
  if (!productCity) {
    return { allowed: true, productCity: null, reason: null };
  }

  if (!normalizeCity(buyerCity)) {
    return { allowed: false, productCity, reason: 'no-buyer-city' };
  }

  if (citiesMatch(productCity, buyerCity)) {
    return { allowed: true, productCity, reason: null };
  }

  return { allowed: false, productCity, reason: 'city-mismatch' };
}

module.exports = {
  SUPPORTED_CITIES,
  CITY_RESTRICTION_ENABLED,
  normalizeCity,
  isCityServiceable,
  citiesMatch,
  getProductCity,
  checkCityRestriction,
};
