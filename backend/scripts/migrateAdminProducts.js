/**
 * One-time migration: move all admin-created products under a "VeriSpine Official" seller.
 *
 * Steps:
 *   1. Ensure user doc 'verispine-official' exists (role=seller, sellerProfile populated, verifiedSeller=true).
 *   2. Find all products whose sellerId belongs to a user with role='admin'.
 *   3. Reassign those products to sellerId='verispine-official' (and update sellerName).
 *
 * Idempotent — safe to re-run.
 *
 * Usage: node scripts/migrateAdminProducts.js
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

const OFFICIAL_USER_ID = 'verispine-official';
const OFFICIAL_BUSINESS_NAME = 'VeriSpine Official';
const OFFICIAL_SLUG = 'verispine-official';

async function ensureOfficialSeller() {
  console.log('=== Ensuring VeriSpine Official seller exists ===');
  const userRef = db.collection('users').doc(OFFICIAL_USER_ID);
  const userDoc = await userRef.get();
  const ts = admin.firestore.FieldValue.serverTimestamp();

  if (!userDoc.exists) {
    await userRef.set({
      uid: OFFICIAL_USER_ID,
      username: 'verispine',
      email: 'official@verispinejointcenters.com',
      firstName: 'VeriSpine',
      lastName: 'Official',
      role: 'seller',
      balance: 0,
      emailVerified: true,
      kycStatus: 'APPROVED',
      verified: true,
      sellerProfile: {
        businessName: OFFICIAL_BUSINESS_NAME,
        slug: OFFICIAL_SLUG,
        description: 'Official VeriSpine-curated listings.',
        logoUrl: null,
        bannerUrl: null,
        contactEmail: 'info@verispinejointcenters.com',
        returnPolicy: 'Returns handled per VeriSpine platform terms.',
        shippingPolicy: 'Ships via SAPO from VeriSpine hubs.',
        verifiedSeller: true,
        memberSinceAsSeller: ts,
        totalSales: 0,
        totalRevenue: 0,
        activeListings: 0,
        averageRating: 0,
        ratingCount: 0
      },
      createdAt: ts,
      updatedAt: ts
    });
    console.log('  ✓ Created VeriSpine Official seller');
  } else {
    // Ensure required fields are present (idempotent top-up)
    const data = userDoc.data();
    const updates = {};
    if (data.role !== 'seller') updates.role = 'seller';
    if (!data.sellerProfile?.slug) updates['sellerProfile.slug'] = OFFICIAL_SLUG;
    if (!data.sellerProfile?.businessName) updates['sellerProfile.businessName'] = OFFICIAL_BUSINESS_NAME;
    if (data.sellerProfile?.verifiedSeller !== true) updates['sellerProfile.verifiedSeller'] = true;
    if (Object.keys(updates).length > 0) {
      updates.updatedAt = ts;
      await userRef.update(updates);
      console.log('  ✓ Updated VeriSpine Official seller fields:', Object.keys(updates).join(', '));
    } else {
      console.log('  • VeriSpine Official seller already configured');
    }
  }
}

async function migrateProducts() {
  console.log('\n=== Migrating admin-owned products to VeriSpine Official ===');

  // 1. Find all admin user IDs
  const adminsSnap = await db.collection('users').where('role', '==', 'admin').get();
  const adminIds = new Set();
  adminsSnap.forEach(doc => adminIds.add(doc.id));
  console.log(`  Found ${adminIds.size} admin user(s).`);

  if (adminIds.size === 0) {
    console.log('  • No admins found, nothing to migrate.');
    return;
  }

  // 2. Pull all products and filter in memory (Firestore doesn't support 'in' queries on >30 ids cleanly)
  const productsSnap = await db.collection('products').get();
  let migrated = 0;
  let skipped = 0;

  for (const doc of productsSnap.docs) {
    const product = doc.data();
    if (!adminIds.has(product.sellerId)) {
      skipped++;
      continue;
    }
    if (product.sellerId === OFFICIAL_USER_ID) {
      skipped++;
      continue;
    }
    await doc.ref.update({
      sellerId: OFFICIAL_USER_ID,
      sellerName: OFFICIAL_BUSINESS_NAME,
      'seller.id': OFFICIAL_USER_ID,
      'seller.username': OFFICIAL_BUSINESS_NAME,
      'seller.businessName': OFFICIAL_BUSINESS_NAME,
      'seller.slug': OFFICIAL_SLUG,
      'seller.verifiedSeller': true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    migrated++;
    console.log(`  ✓ migrated product ${doc.id} (${product.title || 'untitled'})`);
  }

  console.log(`\n  Migrated: ${migrated}`);
  console.log(`  Skipped:  ${skipped}`);
}

async function main() {
  console.log('Starting VeriSpine Official migration...\n');
  try {
    await ensureOfficialSeller();
    await migrateProducts();
    console.log('\n✅ Migration complete.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  }
}

main();
