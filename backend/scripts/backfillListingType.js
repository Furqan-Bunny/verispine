/**
 * One-time backfill: stamp listingType:'auction' on every product that predates
 * the auction-vs-sale split. Existing products are all auctions, but they lack the
 * new field — without it, a Firestore `where('listingType','==','auction')` query
 * (or any future server-side type filter) would silently exclude them.
 *
 * Idempotent: products that already have listingType are skipped.
 *
 * Usage:
 *   node scripts/backfillListingType.js            # live run
 *   node scripts/backfillListingType.js --dry-run  # report only, no writes
 */
const admin = require('firebase-admin');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const DRY_RUN = process.argv.includes('--dry-run');

// Initialize Firebase Admin
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET
});

const db = admin.firestore();

async function backfillListingType() {
  console.log(`Starting listingType backfill${DRY_RUN ? ' (DRY RUN — no writes)' : ''}...`);

  const snapshot = await db.collection('products').get();

  if (snapshot.empty) {
    console.log('No products found.');
    return;
  }

  console.log(`Found ${snapshot.size} products`);

  let updated = 0;
  let skipped = 0;

  // Batch writes (Firestore caps at 500 ops/batch)
  let batch = db.batch();
  let batchOps = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();

    if (data.listingType === 'auction' || data.listingType === 'sale') {
      skipped++;
      continue;
    }

    console.log(`  ${DRY_RUN ? 'WOULD set' : 'Setting'} listingType='auction' on ${doc.id} ("${data.title || 'untitled'}")`);
    updated++;

    if (!DRY_RUN) {
      batch.update(doc.ref, {
        listingType: 'auction',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      batchOps++;
      if (batchOps >= 450) {
        await batch.commit();
        batch = db.batch();
        batchOps = 0;
      }
    }
  }

  if (!DRY_RUN && batchOps > 0) {
    await batch.commit();
  }

  console.log(`\nBackfill complete: ${updated} ${DRY_RUN ? 'would be updated' : 'updated'}, ${skipped} skipped (already typed)`);
}

backfillListingType()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Backfill failed:', err);
    process.exit(1);
  });
