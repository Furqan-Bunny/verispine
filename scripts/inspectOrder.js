#!/usr/bin/env node
/**
 * Inspect an order's full Firestore document. Read-only.
 * Usage: node scripts/inspectOrder.js <orderId>
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'backend', '.env') });

const { db } = require('../backend/config/firebase');

async function main() {
  const orderId = process.argv[2];
  if (!orderId) {
    console.error('Usage: node scripts/inspectOrder.js <orderId>');
    process.exit(1);
  }

  const doc = await db.collection('orders').doc(orderId).get();
  if (!doc.exists) {
    console.error(`Order ${orderId} not found.`);
    process.exit(1);
  }

  const order = doc.data();
  console.log(`=== ORDER ${orderId} ===\n`);

  console.log('--- Status fields ---');
  console.log('  status:          ', order.status);
  console.log('  paymentStatus:   ', order.paymentStatus);
  console.log('  paymentMethod:   ', order.paymentMethod);
  console.log('  shippingStatus:  ', order.shippingStatus);
  console.log('  trackingNumber:  ', order.trackingNumber || '(none)');
  console.log('  carrier:         ', order.carrier || '(none)');
  console.log('  shippingError:   ', order.shippingError || '(none)');

  console.log('\n--- Shipping info (recipient) ---');
  console.log(JSON.stringify(order.shippingInfo || {}, null, 2));

  console.log('\n--- Pickup (ship-from origin) ---');
  console.log('  pickup:           ', JSON.stringify(order.pickup || null, null, 2));
  console.log('  pickupLocation:   ', order.pickupLocation || '(none)');
  console.log('  productLocation:  ', order.productLocation || '(none)');

  console.log('\n--- Seller block ---');
  console.log(JSON.stringify(order.seller || {}, null, 2));

  console.log('\n--- Money ---');
  console.log('  amount:          ', order.amount);
  console.log('  shippingCost:    ', order.shippingCost);
  console.log('  totalAmount:     ', order.totalAmount);
  console.log('  paidAmount:      ', order.paidAmount);

  console.log('\n--- Timestamps ---');
  const fmt = (t) => {
    if (!t) return '(none)';
    if (t.toDate) return t.toDate().toISOString();
    if (t._seconds) return new Date(t._seconds * 1000).toISOString();
    return t;
  };
  console.log('  createdAt:       ', fmt(order.createdAt));
  console.log('  updatedAt:       ', fmt(order.updatedAt));
  console.log('  paidAt:          ', fmt(order.paidAt));
  console.log('  shippedAt:       ', fmt(order.shippedAt));
  console.log('  paymentDeadline: ', fmt(order.paymentDeadline));

  console.log('\n--- Also check shipments collection ---');
  const shipDoc = await db.collection('shipments').doc(orderId).get();
  if (shipDoc.exists) {
    console.log('  Shipment doc EXISTS');
    const ship = shipDoc.data();
    console.log('  trackingNumber:  ', ship.trackingNumber);
    console.log('  carrier:         ', ship.carrier);
    console.log('  status:          ', ship.status);
    console.log('  currentStatus:   ', ship.currentStatus);
    console.log('  isMock:          ', ship.isMock);
    console.log('  events:          ', JSON.stringify(ship.events, null, 2));
  } else {
    console.log('  No shipment doc found for this orderId');
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
