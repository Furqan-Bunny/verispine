#!/usr/bin/env node
/**
 * Retry SAPO shipment creation for orders that are paid but stuck without a tracking number.
 *
 * What "stuck" means here:
 *   - paymentStatus is 'paid' or 'completed' (i.e., buyer's money has cleared)
 *   - status is 'processing' or 'pending' (i.e., not yet 'shipped' or 'delivered' or 'cancelled')
 *   - trackingNumber is missing
 *
 * For each stuck order this script:
 *   1. Calls sapoShippingService.createShipmentForOrder(order)
 *   2. On success: updates the order to status='shipped' with trackingNumber + carrier + shippedAt
 *   3. On success: sends the buyer the order confirmation/invoice email and the seller the sale notification
 *   4. On failure: persists shippingError + shippingErrorAt so you can see why and rerun safely
 *
 * Safe to run repeatedly — already-shipped orders are skipped.
 *
 * Usage:
 *   DRY RUN (no writes, no SAPO calls):   node scripts/retryStuckShipments.js --dry-run
 *   LIVE:                                  node scripts/retryStuckShipments.js
 *   Single order:                          node scripts/retryStuckShipments.js --order=<orderId>
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'backend', '.env') });

const { admin, db } = require('../backend/config/firebase');
const sapoShippingService = require('../backend/services/sapoShippingService');
const emailService = require('../backend/services/resendEmailService');

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const orderArg = args.find(a => a.startsWith('--order='));
const singleOrderId = orderArg ? orderArg.split('=')[1] : null;

async function findStuckOrders() {
  if (singleOrderId) {
    const doc = await db.collection('orders').doc(singleOrderId).get();
    if (!doc.exists) {
      console.error(`Order ${singleOrderId} not found.`);
      return [];
    }
    return [doc];
  }

  // Query for orders that have been paid but never got a tracking number.
  // Firestore can't combine !=  with multiple where clauses cleanly, so we
  // pull both candidate buckets and filter in memory.
  const buckets = await Promise.all([
    db.collection('orders').where('status', '==', 'processing').get(),
    db.collection('orders').where('status', '==', 'pending').get()
  ]);

  const candidates = [];
  for (const snapshot of buckets) {
    snapshot.forEach(doc => {
      const data = doc.data();
      const paid = data.paymentStatus === 'paid' || data.paymentStatus === 'completed';
      const noTracking = !data.trackingNumber;
      if (paid && noTracking) {
        candidates.push(doc);
      }
    });
  }

  return candidates;
}

async function retryShipment(orderDoc) {
  const orderId = orderDoc.id;
  const order = { id: orderId, ...orderDoc.data() };
  const orderRef = orderDoc.ref;

  console.log(`\n--- Order ${orderId} ---`);
  console.log(`  Product:        ${order.productTitle || '(no title)'}`);
  console.log(`  Buyer:          ${order.buyerName || order.buyerId}`);
  console.log(`  Amount:         $${order.amount}`);
  console.log(`  Status:         ${order.status}`);
  console.log(`  Payment Status: ${order.paymentStatus}`);
  console.log(`  Payment Method: ${order.paymentMethod || '(unknown)'}`);
  console.log(`  Prior error:    ${order.shippingError || '(none)'}`);

  if (isDryRun) {
    console.log(`  [DRY RUN] Would attempt SAPO shipment creation.`);
    return { orderId, action: 'would-retry' };
  }

  let shippingInfo = null;
  try {
    const shipmentResult = await sapoShippingService.createShipmentForOrder(order);
    console.log(`  ✅ SAPO tracking: ${shipmentResult.trackingNumber}`);

    await orderRef.update({
      status: 'shipped',
      trackingNumber: shipmentResult.trackingNumber,
      carrier: 'SAPO',
      shippingStatus: 'shipped',
      shippedAt: admin.firestore.FieldValue.serverTimestamp(),
      shippingError: admin.firestore.FieldValue.delete(),
      shippingErrorAt: admin.firestore.FieldValue.delete()
    });

    shippingInfo = {
      trackingNumber: shipmentResult.trackingNumber,
      carrier: 'SAPO',
      status: 'shipped'
    };
  } catch (shippingError) {
    console.error(`  ❌ SAPO shipment failed: ${shippingError.message}`);
    try {
      await orderRef.update({
        shippingError: shippingError.message,
        shippingErrorAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (e) {
      console.error(`  Failed to persist shippingError: ${e.message}`);
    }
    return { orderId, action: 'failed', error: shippingError.message };
  }

  // Send confirmation emails — only once per recovery, marked so we don't double-send on rerun
  if (!order.recoveryEmailsSentAt) {
    try {
      const buyerDoc = await db.collection('users').doc(order.buyerId).get();
      const finalOrderDoc = await orderRef.get();
      const finalOrder = { id: orderId, ...finalOrderDoc.data() };

      if (buyerDoc.exists) {
        await emailService.sendOrderConfirmationWithInvoice(buyerDoc.data(), finalOrder, shippingInfo);
        console.log('  📧 Buyer invoice email sent');
      }

      if (order.sellerId) {
        const sellerDoc = await db.collection('users').doc(order.sellerId).get();
        if (sellerDoc.exists) {
          await emailService.sendSaleNotification(sellerDoc.data(), finalOrder);
          console.log('  📧 Seller sale email sent');
        }
      }

      await orderRef.update({
        recoveryEmailsSentAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (emailError) {
      console.error(`  Email error: ${emailError.message}`);
    }
  } else {
    console.log('  📧 Skipping emails — already sent during a prior recovery');
  }

  return { orderId, action: 'shipped', trackingNumber: shippingInfo.trackingNumber };
}

async function main() {
  console.log('VeriSpine stuck-shipment recovery script');
  console.log(`Mode: ${isDryRun ? 'DRY RUN (no writes)' : 'LIVE'}`);
  if (singleOrderId) {
    console.log(`Targeting single order: ${singleOrderId}`);
  }

  const stuckOrders = await findStuckOrders();
  console.log(`\nFound ${stuckOrders.length} candidate order(s).`);

  if (stuckOrders.length === 0) {
    console.log('Nothing to do.');
    process.exit(0);
  }

  const results = { shipped: 0, failed: 0, skipped: 0, dryRun: 0 };
  for (const doc of stuckOrders) {
    try {
      const result = await retryShipment(doc);
      if (result.action === 'shipped') results.shipped++;
      else if (result.action === 'failed') results.failed++;
      else if (result.action === 'would-retry') results.dryRun++;
      else results.skipped++;
    } catch (err) {
      console.error(`  Unexpected error on ${doc.id}: ${err.message}`);
      results.failed++;
    }
  }

  console.log('\n=== Recovery summary ===');
  console.log(`  Shipped:  ${results.shipped}`);
  console.log(`  Failed:   ${results.failed}`);
  console.log(`  Dry-run:  ${results.dryRun}`);
  console.log(`  Skipped:  ${results.skipped}`);
  console.log(`  Total:    ${stuckOrders.length}`);

  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
