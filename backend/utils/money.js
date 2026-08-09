/**
 * Money helpers.
 *
 * Balances are stored as JavaScript numbers, which are binary floats — 161.1
 * minus 100 is 61.099999999999994, not 61.1. Left alone this is not cosmetic:
 * a seller whose balance renders as "$61.10" was told "Insufficient balance.
 * Available: $61.099999999999994" when withdrawing exactly that, i.e. could not
 * withdraw their own money, and the error leaked a nonsense figure.
 *
 * The thorough fix is to store integer cents everywhere. That is a schema
 * migration across every balance, order and payout, so instead this rounds at
 * the boundary: every value written to a balance goes through round2(), and
 * every "can they afford it" comparison uses a half-cent tolerance. Drift
 * therefore cannot accumulate, and a comparison can never contradict what the
 * user was shown.
 */

/** Round to cents. Returns 0 for anything non-finite rather than writing NaN. */
function round2(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  // Number.EPSILON nudges the classic 1.005 → 1.00 case to 1.01.
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Sum of amounts, rounded once at the end. */
function addMoney(...values) {
  return round2(values.reduce((sum, v) => sum + (Number(v) || 0), 0));
}

/** a - b, rounded. */
function subtractMoney(a, b) {
  return round2((Number(a) || 0) - (Number(b) || 0));
}

/**
 * Is `balance` enough to cover `amount`?
 *
 * Tolerant by half a cent, so a balance that displays as $61.10 always passes a
 * $61.10 check regardless of which side accumulated the float error.
 */
function hasSufficientFunds(balance, amount) {
  return round2(balance) + 0.005 >= round2(amount);
}

/** Format for user-facing messages, so no error ever prints 61.099999999999994. */
function formatMoney(value) {
  return round2(value).toFixed(2);
}

module.exports = { round2, addMoney, subtractMoney, hasSufficientFunds, formatMoney };
