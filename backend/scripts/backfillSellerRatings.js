/**
 * One-time backfill: compute and store seller aggregate ratings.
 *
 * For each user with role='seller', queries reviews where sellerId matches
 * and writes sellerProfile.averageRating + sellerProfile.ratingCount.
 *
 * Also: backfills sellerId on existing reviews by looking up the product.
 *
 * Usage: node scripts/backfillSellerRatings.js
 */
const admin = require('firebase-admin');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET
});

const db = admin.firestore();

async function backfillReviewSellerIds() {
  console.log('\n=== Backfilling sellerId on reviews ===');
  const reviewsSnap = await db.collection('reviews').get();
  const productCache = new Map();
  let updated = 0;

  for (const doc of reviewsSnap.docs) {
    const r = doc.data();
    if (r.sellerId) continue;
    if (!r.productId) continue;

    let sellerId = productCache.get(r.productId);
    if (sellerId === undefined) {
      const productDoc = await db.collection('products').doc(r.productId).get();
      sellerId = productDoc.exists ? productDoc.data().sellerId : null;
      productCache.set(r.productId, sellerId);
    }

    if (sellerId) {
      await doc.ref.update({ sellerId });
      updated++;
      console.log(`  ✓ review ${doc.id} → sellerId ${sellerId}`);
    } else {
      console.log(`  ✗ review ${doc.id}: no sellerId resolvable`);
    }
  }
  console.log(`Updated sellerId on ${updated} reviews.`);
}

async function recomputeSellerAggregates() {
  console.log('\n=== Recomputing seller aggregate ratings ===');
  const sellersSnap = await db.collection('users').where('role', '==', 'seller').get();
  let processed = 0;

  for (const doc of sellersSnap.docs) {
    const sellerId = doc.id;
    const reviewsSnap = await db.collection('reviews').where('sellerId', '==', sellerId).get();

    let total = 0;
    let count = 0;
    reviewsSnap.forEach(r => {
      const rating = r.data().rating;
      if (typeof rating === 'number') {
        total += rating;
        count++;
      }
    });
    const avg = count > 0 ? parseFloat((total / count).toFixed(2)) : 0;

    await doc.ref.update({
      'sellerProfile.averageRating': avg,
      'sellerProfile.ratingCount': count,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    processed++;
    console.log(`  ✓ seller ${sellerId} → avg=${avg} count=${count}`);
  }

  console.log(`Recomputed aggregates for ${processed} sellers.`);
}

async function main() {
  console.log('Starting seller ratings backfill...');
  try {
    await backfillReviewSellerIds();
    await recomputeSellerAggregates();
    console.log('\n✅ Done.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Backfill failed:', err);
    process.exit(1);
  }
}

main();
