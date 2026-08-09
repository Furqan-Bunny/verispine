/**
 * Server-side counterpart to frontend/src/config/locale.ts — keep the two in sync.
 *
 * Region-specific behaviour (currency, address shape, phone/postal validation,
 * units) lives here so it is defined once rather than repeated across routes,
 * services and email templates.
 */

const LOCALE = 'en-US';
const CURRENCY = 'USD';
const CURRENCY_SYMBOL = '$';
const COUNTRY = 'United States';
const COUNTRY_CODE = 'US';

const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado',
  'Connecticut', 'Delaware', 'District of Columbia', 'Florida', 'Georgia',
  'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky',
  'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota',
  'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire',
  'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota',
  'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island',
  'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont',
  'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming',
];

const DEFAULT_STATE = 'Georgia';

// ---- Validation ----------------------------------------------------------

/** US ZIP: 5 digits, optionally +4. */
const POSTAL_CODE_RE = /^\d{5}(-\d{4})?$/;

/** US phone: 10 digits, optional +1, common separators. */
const PHONE_RE = /^(\+?1[\s.-]?)?\(?[2-9]\d{2}\)?[\s.-]?\d{3}[\s.-]?\d{4}$/;

// ---- Units ---------------------------------------------------------------

/**
 * Pounds. The ceiling is high on purpose — this marketplace lists medical
 * machinery that ships as freight. The previous 30 kg parcel cap would have
 * rejected most of the catalogue.
 */
const WEIGHT_UNIT = 'lbs';
const WEIGHT_MIN = 0.1;
const WEIGHT_MAX = 5000;

/** Above this, an item routes to freight quoting instead of parcel rating. */
const FREIGHT_THRESHOLD_LBS = 150;

const DIMENSION_UNIT = 'in';
const DIMENSION_MAX = 120;

// ---- Formatting ----------------------------------------------------------

const formatCurrency = (amount) =>
  new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: CURRENCY,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount) || 0);

/** Digits-only US phone, suitable for carrier APIs. */
const normalizePhone = (phone) => {
  const d = String(phone || '').replace(/\D/g, '');
  return d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
};

module.exports = {
  LOCALE,
  CURRENCY,
  CURRENCY_SYMBOL,
  COUNTRY,
  COUNTRY_CODE,
  US_STATES,
  DEFAULT_STATE,
  POSTAL_CODE_RE,
  PHONE_RE,
  WEIGHT_UNIT,
  WEIGHT_MIN,
  WEIGHT_MAX,
  FREIGHT_THRESHOLD_LBS,
  DIMENSION_UNIT,
  DIMENSION_MAX,
  formatCurrency,
  normalizePhone,
};
