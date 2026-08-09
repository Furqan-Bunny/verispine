/**
 * Carrier presentation helpers.
 *
 * Kept in one place because the carrier name is written by the backend (see
 * services/shipmentRecord.js) and read in at least four UI surfaces — order
 * detail, the tracking panel, admin orders and the PDF invoice. When those
 * drifted apart in the old codebase, buyers got tracking links pointing at the
 * wrong carrier.
 */
export type CarrierKey = 'usps' | 'ups' | 'freight' | 'other';

export const normalizeCarrier = (carrier?: string | null): CarrierKey => {
  const c = String(carrier || '').trim().toLowerCase();
  if (c === 'ups') return 'ups';
  if (c === 'usps') return 'usps';
  if (c === 'freight' || c === 'ltl') return 'freight';
  return c ? 'other' : 'usps';
};

export const carrierLabel = (carrier?: string | null): string => {
  switch (normalizeCarrier(carrier)) {
    case 'ups': return 'UPS';
    case 'usps': return 'USPS';
    case 'freight': return 'Freight (LTL)';
    default: return String(carrier);
  }
};

/**
 * Public tracking URL, or null when the carrier has no self-serve portal we can
 * link to (freight, or a carrier an admin typed in by hand). Callers must handle
 * null rather than falling back to a guess — a broken tracking link reads as a
 * lost parcel.
 */
export const carrierTrackingUrl = (carrier: string | null | undefined, trackingNumber: string): string | null => {
  if (!trackingNumber) return null;
  const tn = encodeURIComponent(trackingNumber);
  switch (normalizeCarrier(carrier)) {
    case 'ups': return `https://www.ups.com/track?tracknum=${tn}`;
    case 'usps': return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${tn}`;
    default: return null;
  }
};
