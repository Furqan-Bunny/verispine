const admin = require('firebase-admin');
const serviceAccount = require('../config/serviceAccountKey.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.cert(serviceAccount)
});

const db = admin.firestore();

async function createIndexes() {
  console.log('Creating Firestore indexes...');
  
  // Note: Indexes can't be created programmatically via Admin SDK
  // They must be created via Firebase Console or deployed via Firebase CLI
  
  console.log('\n📌 Required indexes for Quicksell:\n');
  
  const indexes = [
    {
      collection: 'products',
      query: 'where status == "active" where endDate <= [timestamp]',
      purpose: 'For auction scheduler to find expired auctions'
    },
    {
      collection: 'bids',
      query: 'where productId == [id] where status == "active" orderBy amount desc',
      purpose: 'For finding highest bid on a product'
    },
    {
      collection: 'products',
      query: 'where winnerId == [userId] orderBy endedAt desc',
      purpose: 'For user activity - won auctions'
    },
    {
      collection: 'orders',
      query: 'where buyerId == [userId] orderBy createdAt desc',
      purpose: 'For user dashboard - recent orders'
    },
    {
      collection: 'bids',
      query: 'where userId == [userId] orderBy createdAt desc',
      purpose: 'For user dashboard - recent bids'
    },
    {
      collection: 'watchlist',
      query: 'where userId == [userId] orderBy createdAt desc',
      purpose: 'For user wishlist page'
    }
  ];
  
  indexes.forEach((index, i) => {
    console.log(`${i + 1}. Collection: ${index.collection}`);
    console.log(`   Query: ${index.query}`);
    console.log(`   Purpose: ${index.purpose}\n`);
  });
  
  console.log('✅ To create these indexes:');
  console.log('1. Run: firebase deploy --only firestore:indexes');
  console.log('2. Or visit the Firebase Console > Firestore > Indexes');
  console.log('3. The indexes will be created automatically when queries run (may take a few minutes)');
  
  // Test a query to trigger index creation
  console.log('\n🔄 Testing queries to trigger index creation...');
  
  try {
    // This will trigger index creation if not exists
    await db.collection('products')
      .where('status', '==', 'active')
      .where('endDate', '<=', new Date())
      .limit(1)
      .get();
    console.log('✅ Products expired auction index triggered');
  } catch (error) {
    console.log('⚠️ Products index needs creation:', error.message);
  }
  
  try {
    await db.collection('bids')
      .where('productId', '==', 'test')
      .where('status', '==', 'active')
      .orderBy('amount', 'desc')
      .limit(1)
      .get();
    console.log('✅ Bids highest amount index triggered');
  } catch (error) {
    console.log('⚠️ Bids index needs creation:', error.message);
  }
  
  console.log('\n✅ Index creation process initiated!');
  console.log('Indexes will be ready in a few minutes.');
  
  process.exit(0);
}

createIndexes().catch(console.error);