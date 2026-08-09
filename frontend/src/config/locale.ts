/**
 * Single source of truth for region-specific behaviour (currency, address
 * shape, phone/postal validation, units).
 *
 * The platform was originally built for South Africa with these values
 * scattered across ~40 files. Everything now routes through here so a future
 * region change is one edit, not an archaeology exercise.
 */

export const LOCALE = 'en-US'
export const CURRENCY = 'USD'
export const CURRENCY_SYMBOL = '$'
export const COUNTRY = 'United States'
export const COUNTRY_CODE = 'US'

/** US states + DC, used for every address selector. */
export const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado',
  'Connecticut', 'Delaware', 'District of Columbia', 'Florida', 'Georgia',
  'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky',
  'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota',
  'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire',
  'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota',
  'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island',
  'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont',
  'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming',
] as const

export type USState = (typeof US_STATES)[number]

/**
 * The client is Georgia-based, so that is the sensible default.
 * Typed as `string` rather than `USState`: it seeds mutable form state that
 * later accepts any selected value, and a literal-union default would make
 * every setState on that field a type error.
 */
export const DEFAULT_STATE: string = 'Georgia'

// ---- Validation ----------------------------------------------------------

/** US ZIP: 5 digits, optionally +4. */
export const POSTAL_CODE_RE = /^\d{5}(-\d{4})?$/
export const POSTAL_CODE_HINT = '5 digits (e.g. 30035)'

/**
 * US phone. Accepts 10 digits with an optional +1 and common separators —
 * validation happens on the digits, formatting is cosmetic.
 */
export const PHONE_RE = /^(\+?1[\s.-]?)?\(?[2-9]\d{2}\)?[\s.-]?\d{3}[\s.-]?\d{4}$/
export const PHONE_HINT = '10-digit US number (e.g. (404) 500-1675)'

// ---- Units ---------------------------------------------------------------

/**
 * Weight is in pounds. The ceiling is deliberately high: this marketplace
 * lists medical machinery (imaging systems, tables, sterilisers) that ships
 * as freight, not parcel. The old 30 kg parcel cap would have rejected most
 * of the catalogue.
 */
export const WEIGHT_UNIT = 'lbs'
export const WEIGHT_MIN = 0.1
export const WEIGHT_MAX = 5000

/** Above this weight an item is treated as freight rather than parcel. */
export const FREIGHT_THRESHOLD_LBS = 150

export const DIMENSION_UNIT = 'in'
export const DIMENSION_MAX = 120

// ---- Formatting ----------------------------------------------------------

export const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: CURRENCY,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount) || 0)

/** Format a 10-digit US number as (404) 500-1675. Returns input unchanged if it isn't 10 digits. */
export const formatPhone = (phone: string): string => {
  const d = String(phone || '').replace(/\D/g, '')
  const n = d.length === 11 && d.startsWith('1') ? d.slice(1) : d
  if (n.length !== 10) return phone
  return `(${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}`
}
