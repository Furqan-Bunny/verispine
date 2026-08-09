/**
 * One-time backfill script to add paymentDeadline to existing pending_payment orders.
 *
 * For each order with status 'pending_payment' and no paymentDeadline:
 *   - Sets paymentDeadline = createdAt + 7 days (or 2 days from now if already past)
 *   - Sets remindersSent = []
 *
 * Usage: node scripts/backfillPaymentDeadlines.js
 */
const admin = require('firebase-admin');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Initialize Firebase Admin
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET
});

const db = admin.firestore();

async function backfillPaymentDeadlines() {
  console.log('Starting payment deadline backfill...');

  const snapshot = await db.collection('orders')
    .where('status', '==', 'pending_payment')
    .get();

  if (snapshot.empty) {
    console.log('No pending_payment orders found.');
    return;
  }

  console.log(`Found ${snapshot.size} pending_payment orders`);

  let updated = 0;
  let skipped = 0;
  const now = Date.now();
  const twoDaysFromNow = new Date(now + 2 * 24 * 60 * 60 * 1000);

  for (const doc of snapshot.docs) {
    const data = doc.data();

    // Skip if already has paymentDeadline
    if (data.paymentDeadline) {
      skipped++;
      continue;
    }

    // Calculate deadline based on createdAt
    let deadline;
    const createdAt = data.createdAt?.toDate?.() || (data.createdAt ? new Date(data.createdAt) : null);

    if (createdAt) {
      const naturalDeadline = new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);
      // If natural deadline is already past, give 2 days from now
      deadline = naturalDeadline > new Date() ? naturalDeadline : twoDaysFromNow;
    } else {
      // No createdAt, give 2 days from now
      deadline = twoDaysFromNow;
    }

    await doc.ref.update({
      paymentDeadline: deadline,
      remindersSent: [],
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`  Updated order ${doc.id} - deadline: ${deadline.toISOString()}`);
    updated++;
  }

  console.log(`\nBackfill complete: ${updated} updated, ${skipped} skipped (already had deadline)`);
}

backfillPaymentDeadlines()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Backfill failed:', err);
    process.exit(1);
  });
