/**
 * Client-side address / contact / weight validation.
 * Mirror of backend/utils/addressValidation.js — keep both in sync.
 *
 * Region rules come from config/locale.ts.
 */

import {
  POSTAL_CODE_RE,
  PHONE_RE,
  WEIGHT_MIN,
  WEIGHT_MAX,
  WEIGHT_UNIT,
} from '../config/locale'

export const MAX_NAME = 50
export const MAX_ADDRESS = 100
export const MAX_CITY = 50
export const MAX_SUBURB = 100
export const MAX_POSTCODE = 10
export const MAX_PHONE = 20

export { POSTAL_CODE_RE, PHONE_RE }

export interface ShippingValidationResult {
  valid: boolean
  errors?: Record<string, string>
}

export interface BuyerShippingInfo {
  fullName?: string
  email?: string
  phone?: string
  address?: string
  suburb?: string
  city?: string
  province?: string
  postalCode?: string
  country?: string
}

export function validateBuyerShippingInfo(shipping: BuyerShippingInfo): ShippingValidationResult {
  const errors: Record<string, string> = {}

  const fullName = (shipping.fullName || '').trim()
  if (!fullName) {
    errors.fullName = 'Full name is required'
  } else if (fullName.length > MAX_NAME) {
    errors.fullName = `Full name must be ${MAX_NAME} characters or less`
  }

  const address = (shipping.address || '').trim()
  if (!address) {
    errors.address = 'Street address is required'
  } else if (address.length > MAX_ADDRESS) {
    errors.address = `Street address must be ${MAX_ADDRESS} characters or less`
  }

  const city = (shipping.city || '').trim()
  if (!city) {
    errors.city = 'City is required'
  } else if (city.length > MAX_CITY) {
    errors.city = `City must be ${MAX_CITY} characters or less`
  }

  // Address line 2 is optional.
  const suburb = (shipping.suburb || '').trim()
  if (suburb.length > MAX_SUBURB) {
    errors.suburb = `Address line 2 must be ${MAX_SUBURB} characters or less`
  }

  const state = (shipping.province || '').trim()
  if (!state) {
    errors.province = 'State is required'
  }

  const postalCode = (shipping.postalCode || '').trim()
  if (!postalCode) {
    errors.postalCode = 'ZIP code is required'
  } else if (!POSTAL_CODE_RE.test(postalCode)) {
    errors.postalCode = 'ZIP code must be 5 digits (e.g. 30035)'
  }

  const phone = (shipping.phone || '').trim()
  if (!phone) {
    errors.phone = 'Phone number is required'
  } else if (!PHONE_RE.test(phone)) {
    errors.phone = 'Enter a valid 10-digit US phone number'
  }

  return Object.keys(errors).length === 0
    ? { valid: true }
    : { valid: false, errors }
}

export function validateProductWeight(weight: unknown): { valid: boolean; error?: string; weight?: number } {
  if (weight === undefined || weight === null || weight === '') {
    return { valid: false, error: 'Product weight is required' }
  }
  const num = Number(weight)
  if (Number.isNaN(num)) {
    return { valid: false, error: 'Product weight must be a number' }
  }
  if (num < WEIGHT_MIN) {
    return { valid: false, error: `Weight must be at least ${WEIGHT_MIN} ${WEIGHT_UNIT}` }
  }
  if (num > WEIGHT_MAX) {
    return { valid: false, error: `Weight must be at most ${WEIGHT_MAX} ${WEIGHT_UNIT}` }
  }
  return { valid: true, weight: num }
}
