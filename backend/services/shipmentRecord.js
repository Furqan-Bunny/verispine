const { admin, db } = require('../config/firebase');
const { getParcelDimensions, PARCEL_MAX_DIM_IN } = require('../utils/parcelDimensions');
const { FREIGHT_THRESHOLD_LBS, normalizePhone } = require('../utils/locale');

/**
 * Shared plumbing for shipping providers.
 *
 * Every provider previously repeated the same ~40-line Firestore write and the
 * same order/product/seller lookup. That duplication is where the old carriers
 * drifted apart from each other, so it lives here once and each provider only
 * implements what is genuinely carrier-specific.
 */

/**
 * Load the product and seller a shipment needs. The payment pipeline hands us a
 * bare order, so the provider can't assume these are already attached.
 */
async function loadContext(order) {
  let product = null;
  if (order.productId && db) {
    try {
      const snap = await db.collection('products').doc(order.productId).get();
      if (snap.exists) product = snap.data();
    } catch (e) { console.warn('shipmentRecord: product fetch failed:', e.message); }
  }

  let seller = order.seller || null;
  if (!seller && order.sellerId && db) {
    try {
      const snap = await db.collection('users').doc(order.sellerId).get();
      if (snap.exists) seller = snap.data();
    } catch (e) { console.warn('shipmentRecord: seller fetch failed:', e.message); }
  }

  return { product: product || {}, seller: seller || {} };
}

/** Ship-from address, assembled from the product's pickup block. */
function collectionAddress(order, product, seller) {
  const pk = product.shipping || order.pickup || {};
  const name = seller.businessName
    || seller.sellerProfile?.businessName
    || `${seller.firstName || ''} ${seller.lastName || ''}`.trim()
    || seller.username
    || 'VeriSpine Seller';
  return {
    name,
    company: name,
    street: pk.pickupAddress || pk.address || '',
    street2: pk.pickupSuburb || pk.suburb || '',
    city: pk.pickupCity || pk.city || '',
    state: pk.pickupProvince || pk.province || '',
    postalCode: pk.pickupPostalCode || pk.postalCode || seller.postalCode || '',
    country: 'US',
    phone: normalizePhone(seller.phone || seller.phoneNumber || ''),
    email: seller.email || '',
  };
}

/** Ship-to address, from the buyer's checkout details. */
function deliveryAddress(order) {
  const s = order.shippingInfo || order.shippingAddress || {};
  return {
    name: s.fullName || order.buyerName || 'Customer',
    company: '',
    street: s.address || '',
    street2: s.suburb || '',
    city: s.city || '',
    state: s.province || s.state || '',
    postalCode: s.postalCode || '',
    country: 'US',
    phone: normalizePhone(s.phone || order.buyerPhone || ''),
    email: s.email || order.buyerEmail || '',
  };
}

/**
 * Parcel list for an order. One entry per unit so multi-quantity orders are
 * rated on real total weight/volume rather than a single box.
 */
function buildParcels(order, product) {
  const dims = getParcelDimensions(
    product && (product.dimensions || product.weight)
      ? product
      : { weight: order.weight || order.productWeight }
  );
  const qty = Math.max(1, Number(order.quantity) || 1);
  const weight = Number(order.weight || order.productWeight || product.weight || 1);

  return Array.from({ length: qty }, () => ({
    lengthIn: Number(dims.length),
    widthIn: Number(dims.width),
    heightIn: Number(dims.height),
    weightLbs: weight,
    description: (order.productTitle || product.title || 'Item').slice(0, 100),
  }));
}

/** Total billable weight across all parcels. */
function totalWeight(parcels) {
  return parcels.reduce((sum, p) => sum + Number(p.weightLbs || 0), 0);
}

/**
 * True when an order is too heavy/large for parcel service and must be quoted
 * as freight. Medical machinery hits this constantly, which is why the freight
 * provider exists rather than being an afterthought.
 */
function requiresFreight(parcels) {
  if (totalWeight(parcels) > FREIGHT_THRESHOLD_LBS) return true;
  // Any single dimension beyond parcel limits (108") must go freight.
  return parcels.some(p => Math.max(p.lengthIn, p.widthIn, p.heightIn) > PARCEL_MAX_DIM_IN);
}

/**
 * Persist a shipment. Written to `shipments/{orderId}` so it is idempotent —
 * a retried shipment creation overwrites rather than duplicating.
 */
async function saveShipment(order, {
  trackingNumber,
  carrier,
  service = '',
  cost = null,
  labelUrl = null,
  status = 'shipped',
  currentStatus = 'Order Shipped',
  eventDescription = 'Shipment created',
  extra = {},
  isMock = false,
}) {
  if (!db) return;

  const { product, seller } = await loadContext(order);
  const from = collectionAddress(order, product, seller);
  const to = deliveryAddress(order);
  const parcels = buildParcels(order, product);
  const ts = admin ? admin.firestore.FieldValue.serverTimestamp() : new Date();

  await db.collection('shipments').doc(order.id).set({
    orderId: order.id,
    productId: order.productId,
    buyerId: order.buyerId,
    sellerId: order.sellerId,

    trackingNumber,
    customerRef: order.id,
    carrier,
    service,

    status,
    currentStatus,

    weight: totalWeight(parcels),
    value: Number(order.amount || order.totalAmount || 0),
    shippingCost: cost != null
      ? Number(cost)
      : Number(order.shippingCost || (order.shipmentRate && order.shipmentRate.total) || 0),
    labelUrl,

    senderCity: from.city,
    senderState: from.state,
    recipientCity: to.city,
    recipientState: to.state,

    createdAt: ts,
    updatedAt: ts,
    shippedAt: ts,

    events: [{
      code: 'created',
      status: currentStatus,
      description: eventDescription,
      timestamp: new Date().toISOString(),
      office: from.city || 'Origin',
      officeName: carrier,
    }],

    isMock,
    ...extra,
  });
}

module.exports = {
  loadContext,
  collectionAddress,
  deliveryAddress,
  buildParcels,
  totalWeight,
  requiresFreight,
  saveShipment,
};
