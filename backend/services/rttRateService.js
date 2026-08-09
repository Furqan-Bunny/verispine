const path = require('path');

// Data extracted from RTT's official "VeriSpine Rate Calculator - June 2026" (Door-to-Door / CTC).
//  - rtt-area-table.json : { postalCode: { h: costingHubCode, r: route(MAIN|D OUTL|F OUTL), x: highRisk(0/1), z: SANRAL zone } }
//  - rtt-rate-card.json  : matrix rates, minimums, surcharges, fuel %, VAT, SANRAL zone rates
const area = require(path.join(__dirname, '..', 'data', 'rtt-area-table.json'));
const rc = require(path.join(__dirname, '..', 'data', 'rtt-rate-card.json'));

const round2 = (n) => Math.round(n * 100) / 100;

function lookupArea(postalCode) {
  if (postalCode == null) return null;
  return area[String(postalCode).trim()] || null;
}

/**
 * Replicates the RTT Door-to-Door (CTC) quote from the official rate calculator, exactly:
 *   TOTAL_EX_FUEL = minRate + MAX(billedKg - minKg, 0) * ratePerKg + docFee + highRiskCharge
 *   ratePerKg     = matrix(sameHub ? 2.12 : 5.30) + outlyingSurcharge(areaType)
 *   billedKg      = ceil(max(volumetricKg, actualKg))   ; volumetric = ceil(L*W*H/volFactor * qty)
 *   TOTAL         = (TOTAL_EX_FUEL * (1 + fuel%) + SANRAL) * (1 + VAT)
 * areaType = D OUTL / F OUTL if either end is outlying, else LOCAL if same hub, else MAIN.
 *
 * @returns {{serviceable:boolean, cost?:number, ...}}
 */
function calculateRate({ originPostalCode, destPostalCode, weightKg = 1, dimensions = [], fuelPct } = {}) {
  const O = lookupArea(originPostalCode);
  const D = lookupArea(destPostalCode);
  if (!O || !D) {
    return { serviceable: false, reason: !O ? 'origin_not_serviceable' : 'destination_not_serviceable' };
  }

  let areaType;
  if (O.r === 'D OUTL' || D.r === 'D OUTL') areaType = 'D OUTL';
  else if (O.r === 'F OUTL' || D.r === 'F OUTL') areaType = 'F OUTL';
  else if (O.h === D.h) areaType = 'LOCAL';
  else areaType = 'MAIN';

  // Volumetric weight (per box: L*W*H / volFactor, rounded up, times quantity).
  let vol = 0;
  for (const d of (dimensions || [])) {
    const l = Number(d.length || 0), w = Number(d.width || 0), h = Number(d.height || 0), q = Number(d.quantity || 1);
    if (l > 0 && w > 0 && h > 0) vol += Math.ceil((l * w * h) / rc.volFactor * q);
  }
  const billedKg = Math.max(Math.ceil(Math.max(vol, Number(weightKg) || 0)), 1);

  const perKg = (O.h === D.h ? rc.sameHubRate : rc.crossHubRate) + (rc.outlyingSurcharge[areaType] || 0);
  const minRate = rc.min[areaType];
  const highRiskCharge = D.x ? rc.highRiskCharge : 0;
  const base = minRate + Math.max(billedKg - rc.minKg, 0) * perKg + rc.docFee + highRiskCharge;

  const fuel = (fuelPct != null ? Number(fuelPct) : rc.fuelPct);
  const withFuel = base * (1 + fuel);
  const sanral = (rc.sanral[D.z] || 0) * billedKg;
  const exVat = withFuel + sanral;
  const total = exVat * (1 + rc.vat);

  return {
    serviceable: true,
    cost: round2(total),
    currency: 'ZAR',
    service: 'RTT Door-to-Door (2-3 working days)',
    billedKg,
    areaType,
    breakdown: {
      base: round2(base),
      fuelPct: fuel,
      fuel: round2(base * fuel),
      sanral: round2(sanral),
      vatable: round2(exVat),
      vat: round2(exVat * rc.vat),
      total: round2(total)
    }
  };
}

module.exports = { calculateRate, lookupArea, rateCard: rc };
