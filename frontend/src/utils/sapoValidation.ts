/**
 * SAPO field validation rules.
 *
 * Mirror of backend/utils/sapoValidation.js — keep both in sync.
 * These are the constraints SAPO IPS Import enforces.
 */

// Field length limits (chars)
export const SAPO_MAX_NAME = 35;
export const SAPO_MAX_ADDRESS = 105;
export const SAPO_MAX_CITY = 35;
export const SAPO_MAX_SUBURB = 100;
export const SAPO_MAX_POSTCODE = 8;
export const SAPO_MAX_PHONE = 36;

// SA postcode format: exactly 4 digits
export const SA_POSTCODE_RE = /^\d{4}$/;

// SA phone format: +27 or 0 prefix
export const SA_PHONE_RE = /^(\+27|0)[1-9][0-9]{8}$/;

// Weight bounds (kg)
export const WEIGHT_MIN_KG = 0.1;
export const WEIGHT_MAX_KG = 30;

export interface ShippingValidationResult {
  valid: boolean;
  errors?: Record<string, string>;
}

export interface BuyerShippingInfo {
  fullName?: string;
  email?: string;
  phone?: string;
  address?: string;
  suburb?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  country?: string;
}

export function validateBuyerShippingInfo(shipping: BuyerShippingInfo): ShippingValidationResult {
  const errors: Record<string, string> = {};

  const fullName = (shipping.fullName || '').trim();
  if (!fullName) {
    errors.fullName = 'Full name is required';
  } else if (fullName.length > SAPO_MAX_NAME) {
    errors.fullName = `Full name must be ${SAPO_MAX_NAME} characters or less`;
  }

  const address = (shipping.address || '').trim();
  if (!address) {
    errors.address = 'Address is required';
  } else if (address.length > SAPO_MAX_ADDRESS) {
    errors.address = `Address must be ${SAPO_MAX_ADDRESS} characters or less`;
  }

  const city = (shipping.city || '').trim();
  if (!city) {
    errors.city = 'City is required';
  } else if (city.length > SAPO_MAX_CITY) {
    errors.city = `City must be ${SAPO_MAX_CITY} characters or less`;
  }

  const suburb = (shipping.suburb || '').trim();
  if (!suburb) {
    errors.suburb = 'Suburb is required';
  } else if (suburb.length > SAPO_MAX_SUBURB) {
    errors.suburb = `Suburb must be ${SAPO_MAX_SUBURB} characters or less`;
  }

  const postalCode = (shipping.postalCode || '').trim();
  if (!postalCode) {
    errors.postalCode = 'Postal code is required';
  } else if (!SA_POSTCODE_RE.test(postalCode)) {
    errors.postalCode = 'Postal code must be exactly 4 digits';
  }

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

export function validateProductWeight(weight: unknown): { valid: boolean; error?: string; weight?: number } {
  if (weight === undefined || weight === null || weight === '') {
    return { valid: false, error: 'Product weight is required' };
  }
  const num = Number(weight);
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
