/**
 * SAPO field validation rules.
 *
 * These are the constraints SAPO IPS Import enforces. Keep them in sync with
 * frontend/src/utils/sapoValidation.ts which has the same rules.
 *
 * Source of truth: backend/services/sapoShippingService.js submitMailItem
 * payload + sanitizeString() truncation behavior. Verified against production
 * 2026-04-21/22 + 2026-04-30.
 */

// Field length limits (chars)
const SAPO_MAX_NAME = 35;
const SAPO_MAX_ADDRESS = 105;
const SAPO_MAX_CITY = 35;
const SAPO_MAX_SUBURB = 100; // RTT strSuburb max; also populates ShipLogic local_area
const SAPO_MAX_POSTCODE = 8; // SA postcodes are 4 digits, fits easily
const SAPO_MAX_PHONE = 36;

// SA postcode format: exactly 4 digits
const SA_POSTCODE_RE = /^\d{4}$/;

// SA phone format: +27 or 0 prefix, valid mobile/landline
const SA_PHONE_RE = /^(\+27|0)[1-9][0-9]{8}$/;

// Weight bounds (kg) — SAPO accepts Decimal(5,3), but we cap to a reasonable
// parcel range. SAPO physical limits depend on parcel class.
const WEIGHT_MIN_KG = 0.1;
const WEIGHT_MAX_KG = 30;

/**
 * Validates a buyer's shippingInfo block (Addressee in SAPO terms).
 * Returns { valid: true } on success, or { valid: false, errors: {field: msg} }.
 */
function validateBuyerShippingInfo(shipping) {
  const errors = {};

  if (!shipping || typeof shipping !== 'object') {
    return { valid: false, errors: { _: 'Shipping info is required' } };
  }

  // fullName: required, 1-35
  const fullName = (shipping.fullName || '').trim();
  if (!fullName) {
    errors.fullName = 'Full name is required';
  } else if (fullName.length > SAPO_MAX_NAME) {
    errors.fullName = `Full name must be ${SAPO_MAX_NAME} characters or less`;
  }

  // address: required, 1-105
  const address = (shipping.address || '').trim();
  if (!address) {
    errors.address = 'Address is required';
  } else if (address.length > SAPO_MAX_ADDRESS) {
    errors.address = `Address must be ${SAPO_MAX_ADDRESS} characters or less`;
  }

  // city: required, 1-35
  const city = (shipping.city || '').trim();
  if (!city) {
    errors.city = 'City is required';
  } else if (city.length > SAPO_MAX_CITY) {
    errors.city = `City must be ${SAPO_MAX_CITY} characters or less`;
  }

  // suburb: required (RTT strSuburb; also fills ShipLogic local_area)
  const suburb = (shipping.suburb || '').trim();
  if (!suburb) {
    errors.suburb = 'Suburb is required';
  } else if (suburb.length > SAPO_MAX_SUBURB) {
    errors.suburb = `Suburb must be ${SAPO_MAX_SUBURB} characters or less`;
  }

  // postalCode: required, exactly 4 digits
  const postalCode = (shipping.postalCode || '').trim();
  if (!postalCode) {
    errors.postalCode = 'Postal code is required';
  } else if (!SA_POSTCODE_RE.test(postalCode)) {
    errors.postalCode = 'Postal code must be exactly 4 digits';
  }

  // phone: required (RTT last-mile needs a cell number; used as strTelNo1 + strCellNo)
  const phone = (shipping.phone || '').replace(/\s/g, '');
  if (!phone) {
    errors.phone = 'Phone number is required';
  } else if (!SA_PHONE_RE.test(phone)) {
    errors.phone = 'Phone must be a valid South African number';
  }

  return Object.keys(errors).length === 0
    ? { valid: true }
    : { valid: false, errors };
}

/**
 * Validates a seller's pickup block (Sender in SAPO terms).
 * Same rules as buyer (SAPO doesn't distinguish), with required fields.
 */
function validatePickupAddress(pickup) {
  const errors = {};

  if (!pickup || typeof pickup !== 'object') {
    return { valid: false, errors: { _: 'Pickup address is required' } };
  }

  const address = (pickup.address || '').trim();
  if (!address) {
    errors.address = 'Pickup address is required';
  } else if (address.length > SAPO_MAX_ADDRESS) {
    errors.address = `Pickup address must be ${SAPO_MAX_ADDRESS} characters or less`;
  }

  const city = (pickup.city || '').trim();
  if (!city) {
    errors.city = 'Pickup city is required';
  } else if (city.length > SAPO_MAX_CITY) {
    errors.city = `Pickup city must be ${SAPO_MAX_CITY} characters or less`;
  }

  const suburb = (pickup.suburb || '').trim();
  if (!suburb) {
    errors.suburb = 'Pickup suburb is required';
  } else if (suburb.length > SAPO_MAX_SUBURB) {
    errors.suburb = `Pickup suburb must be ${SAPO_MAX_SUBURB} characters or less`;
  }

  const postalCode = (pickup.postalCode || '').trim();
  if (!postalCode) {
    errors.postalCode = 'Pickup postal code is required';
  } else if (!SA_POSTCODE_RE.test(postalCode)) {
    errors.postalCode = 'Pickup postal code must be exactly 4 digits';
  }

  return Object.keys(errors).length === 0
    ? { valid: true }
    : { valid: false, errors };
}

/**
 * Validates product weight for SAPO shipment.
 */
function validateProductWeight(weight) {
  const num = Number(weight);
  if (!weight && weight !== 0) {
    return { valid: false, error: 'Product weight is required' };
  }
  if (Number.isNaN(num)) {
    return { valid: false, error: 'Product weight must be a number' };
  }
  if (num < WEIGHT_MIN_KG) {
    return { valid: false, error: `Weight must be at least ${WEIGHT_MIN_KG} kg` };
  }
  if (num > WEIGHT_MAX_KG) {
    return { valid: false, error: `Weight must be at most ${WEIGHT_MAX_KG} kg` };
  }
  return { valid: true, weight: num };
}

/**
 * Validates a Pargo pickup-point order: the parcel goes to a Pargo point (not a home address),
 * so we only need the buyer's contact details (name/email/phone = Pargo consignee) plus a chosen
 * pickup point. Returns { valid } or { valid:false, errors }.
 */
function validatePickupPointOrder(shipping, pargoPoint) {
  const errors = {};
  if (!shipping || typeof shipping !== 'object') {
    return { valid: false, errors: { _: 'Contact info is required' } };
  }
  const fullName = (shipping.fullName || '').trim();
  if (!fullName) errors.fullName = 'Full name is required';
  else if (fullName.length > SAPO_MAX_NAME) errors.fullName = `Full name must be ${SAPO_MAX_NAME} characters or less`;

  const email = (shipping.email || '').trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'A valid email is required';

  const phone = (shipping.phone || '').replace(/\s/g, '');
  if (!phone) errors.phone = 'Phone number is required';
  else if (!SA_PHONE_RE.test(phone)) errors.phone = 'Phone must be a valid South African number';

  if (!pargoPoint || !pargoPoint.code) errors.pargoPoint = 'Please choose a Pargo pickup point';

  return Object.keys(errors).length === 0 ? { valid: true } : { valid: false, errors };
}

module.exports = {
  // Constants (exposed for frontend mirroring)
  SAPO_MAX_NAME,
  SAPO_MAX_ADDRESS,
  SAPO_MAX_CITY,
  SAPO_MAX_POSTCODE,
  SAPO_MAX_PHONE,
  WEIGHT_MIN_KG,
  WEIGHT_MAX_KG,
  SA_POSTCODE_RE,
  SA_PHONE_RE,

  // Validators
  validateBuyerShippingInfo,
  validatePickupPointOrder,
  validatePickupAddress,
  validateProductWeight
};
