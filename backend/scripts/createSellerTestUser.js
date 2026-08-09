/**
 * Creates a fresh test user with KYC pre-approved so you can immediately
 * test the "Become a Seller" flow end-to-end without going through KYC.
 *
 * Creates BOTH a Firebase Auth account (so login works) AND the Firestore user doc.
 *
 * Usage: node scripts/createSellerTestUser.js
 *        node scripts/createSellerTestUser.js custom@email.com MyPass123!
 */
const admin = require('firebase-admin');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET
});

const auth = admin.auth();
const db = admin.firestore();

async function main() {
  // Args
  const email = process.argv[2] || 'sellertest@quicksell.co.za';
  const password = process.argv[3] || 'SellerTest123!';
  const firstName = 'Seller';
  const lastName = 'Tester';
  const username = email.split('@')[0];

  console.log('\n=== Creating seller test user ===\n');

  // 1. Create or fetch Firebase Auth user
  let authUser;
  try {
    authUser = await auth.getUserByEmail(email);
    console.log(`Firebase Auth user already exists (uid=${authUser.uid}). Updating password...`);
    await auth.updateUser(authUser.uid, { password, emailVerified: true });
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      authUser = await auth.createUser({
        email,
        password,
        displayName: `${firstName} ${lastName}`,
        emailVerified: true
      });
      console.log(`✓ Firebase Auth user created (uid=${authUser.uid})`);
    } else {
      throw err;
    }
  }

  // 2. Create or merge Firestore user doc with KYC pre-approved
  const userRef = db.collection('users').doc(authUser.uid);
  const ts = admin.firestore.FieldValue.serverTimestamp();

  await userRef.set({
    uid: authUser.uid,
    email,
    username,
    firstName,
    lastName,
    role: 'user',
    balance: 1000,                  // R1000 to play with
    emailVerified: true,
    isActive: true,
    kycStatus: 'NOT_SUBMITTED',     // user will submit KYC themselves
    kycSubmittedAt: null,
    kycReviewedAt: null,
    kycReviewedBy: null,
    kycRejectionReason: null,
    kycDocuments: null,
    verified: false,
    createdAt: ts,
    updatedAt: ts
  }, { merge: true });

  console.log('✓ Firestore user doc created/updated with KYC=NOT_SUBMITTED\n');

  console.log('================================================');
  console.log(' Test user ready');
  console.log('================================================');
  console.log(` Email:    ${email}`);
  console.log(` Password: ${password}`);
  console.log(` UID:      ${authUser.uid}`);
  console.log(` Role:     user`);
  console.log(` KYC:      NOT_SUBMITTED  (you will submit it from the UI)`);
  console.log(` Balance:  R1000`);
  console.log('================================================\n');

  console.log('Full test flow:');
  console.log('  1. Log in at /login with the credentials above.');
  console.log('  2. Visit /kyc → submit ID document + selfie.');
  console.log('  3. Log in as admin at /admin/kyc → review → APPROVE.');
  console.log('  4. Log back in as the test user → /become-seller → fill form + submit.');
  console.log('  5. Log in as admin at /admin/seller-applications → review → APPROVE.');
  console.log('  6. Log back in as the test user → /seller/dashboard.\n');

  process.exit(0);
}

main().catch(err => {
  console.error('Failed to create test user:', err);
  process.exit(1);
});
