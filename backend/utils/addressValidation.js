/**
 * Address, contact and weight validation for US shipments.
 *
 * Region rules come from utils/locale.js — do not hardcode them here.
 * Keep in sync with frontend/src/utils/addressValidation.ts.
 */

const {
  POSTAL_CODE_RE,
  PHONE_RE,
  WEIGHT_MIN,
  WEIGHT_MAX,
  WEIGHT_UNIT,
} = require('./locale');

// Field length limits. Carrier APIs (USPS/UPS) cap address lines, so we
// validate up front rather than letting the carrier reject a paid order.
const MAX_NAME = 50;
const MAX_ADDRESS = 100;
const MAX_CITY = 50;
const MAX_SUBURB = 100; // "address line 2" / unit / suite
const MAX_POSTCODE = 10; // 12345-6789
const MAX_PHONE = 20;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate a buyer's shipping address.
 * @returns {{valid: true}} or {{valid: false, errors: Record<string,string>}}
 */
function validateBuyerShippingInfo(shipping) {
  const errors = {};

  if (!shipping || typeof shipping !== 'object') {
    return { valid: false, errors: { _: 'Shipping info is required' } };
  }

  const fullName = (shipping.fullName || '').trim();
  if (!fullName) {
    errors.fullName = 'Full name is required';
  } else if (fullName.length > MAX_NAME) {
    errors.fullName = `Full name must be ${MAX_NAME} characters or less`;
  }

  const address = (shipping.address || '').trim();
  if (!address) {
    errors.address = 'Street address is required';
  } else if (address.length > MAX_ADDRESS) {
    errors.address = `Street address must be ${MAX_ADDRESS} characters or less`;
  }

  const city = (shipping.city || '').trim();
  if (!city) {
    errors.city = 'City is required';
  } else if (city.length > MAX_CITY) {
    errors.city = `City must be ${MAX_CITY} characters or less`;
  }

  // Address line 2 (suite/unit). Optional — most residential addresses have none.
  const suburb = (shipping.suburb || '').trim();
  if (suburb.length > MAX_SUBURB) {
    errors.suburb = `Address line 2 must be ${MAX_SUBURB} characters or less`;
  }

  const state = (shipping.province || shipping.state || '').trim();
  if (!state) {
    errors.province = 'State is required';
  }

  const postalCode = (shipping.postalCode || '').trim();
  if (!postalCode) {
    errors.postalCode = 'ZIP code is required';
  } else if (!POSTAL_CODE_RE.test(postalCode)) {
    errors.postalCode = 'ZIP code must be 5 digits (e.g. 30035)';
  }

  // Required: carriers need a contact number for delivery exceptions, and
  // freight carriers will not schedule a delivery appointment without one.
  const phone = (shipping.phone || '').trim();
  if (!phone) {
    errors.phone = 'Phone number is required';
  } else if (!PHONE_RE.test(phone)) {
    errors.phone = 'Enter a valid 10-digit US phone number';
  }

  return Object.keys(errors).length === 0
    ? { valid: true }
    : { valid: false, errors };
}

/**
 * Validate a seller's pickup (origin) address — where the carrier collects.
 */
function validatePickupAddress(pickup) {
  const errors = {};

  if (!pickup || typeof pickup !== 'object') {
    return { valid: false, errors: { _: 'Pickup address is required' } };
  }

  const address = (pickup.address || '').trim();
  if (!address) {
    errors.address = 'Pickup street address is required';
  } else if (address.length > MAX_ADDRESS) {
    errors.address = `Pickup address must be ${MAX_ADDRESS} characters or less`;
  }

  const city = (pickup.city || '').trim();
  if (!city) {
    errors.city = 'Pickup city is required';
  } else if (city.length > MAX_CITY) {
    errors.city = `Pickup city must be ${MAX_CITY} characters or less`;
  }

  const state = (pickup.province || pickup.state || '').trim();
  if (!state) {
    errors.province = 'Pickup state is required';
  }

  const postalCode = (pickup.postalCode || '').trim();
  if (!postalCode) {
    errors.postalCode = 'Pickup ZIP code is required';
  } else if (!POSTAL_CODE_RE.test(postalCode)) {
    errors.postalCode = 'Pickup ZIP code must be 5 digits';
  }

  return Object.keys(errors).length === 0
    ? { valid: true }
    : { valid: false, errors };
}

/**
 * Validate a listing's weight (lbs). The upper bound is generous because
 * medical machinery ships as freight — see locale.js.
 */
function validateProductWeight(weight) {
  const num = Number(weight);
  if (!weight && weight !== 0) {
    return { valid: false, error: 'Product weight is required' };
  }
  if (Number.isNaN(num)) {
    return { valid: false, error: 'Product weight must be a number' };
  }
  if (num < WEIGHT_MIN) {
    return { valid: false, error: `Weight must be at least ${WEIGHT_MIN} ${WEIGHT_UNIT}` };
  }
  if (num > WEIGHT_MAX) {
    return { valid: false, error: `Weight must be at most ${WEIGHT_MAX} ${WEIGHT_UNIT}` };
  }
  return { valid: true, weight: num };
}

/**
 * Validate a local-pickup order: the buyer collects from the seller, so only
 * contact details are needed — no delivery address.
 */
function validatePickupPointOrder(shipping) {
  const errors = {};
  if (!shipping || typeof shipping !== 'object') {
    return { valid: false, errors: { _: 'Contact info is required' } };
  }

  const fullName = (shipping.fullName || '').trim();
  if (!fullName) errors.fullName = 'Full name is required';
  else if (fullName.length > MAX_NAME) errors.fullName = `Full name must be ${MAX_NAME} characters or less`;

  const email = (shipping.email || '').trim();
  if (!email || !EMAIL_RE.test(email)) errors.email = 'A valid email is required';

  const phone = (shipping.phone || '').trim();
  if (!phone) errors.phone = 'Phone number is required';
  else if (!PHONE_RE.test(phone)) errors.phone = 'Enter a valid 10-digit US phone number';

  return Object.keys(errors).length === 0 ? { valid: true } : { valid: false, errors };
}

module.exports = {
  MAX_NAME,
  MAX_ADDRESS,
  MAX_CITY,
  MAX_SUBURB,
  MAX_POSTCODE,
  MAX_PHONE,
  POSTAL_CODE_RE,
  PHONE_RE,
  WEIGHT_MIN,
  WEIGHT_MAX,

  validateBuyerShippingInfo,
  validatePickupAddress,
  validateProductWeight,
  validatePickupPointOrder,
};
