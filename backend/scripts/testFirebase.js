const { db, admin } = require('../config/firebase');
require('dotenv').config();

async function testFirebaseConnection() {
  try {
    console.log('🔥 Testing Firebase connection...\n');

    // Test 1: Check if Firebase Admin is initialized
    if (!admin) {
      console.log('❌ Firebase Admin SDK is not initialized');
      return;
    }
    console.log('✅ Firebase Admin SDK initialized');

    // Test 2: Check if Firestore is available
    if (!db) {
      console.log('❌ Firestore database is not available');
      return;
    }
    console.log('✅ Firestore database is available');

    // Test 3: Try to write a test document
    const testRef = db.collection('test').doc('connection-test');
    await testRef.set({
      message: 'Firebase connection test successful!',
      timestamp: new Date(),
      projectId: process.env.FIREBASE_SERVICE_ACCOUNT ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT).project_id : 'unknown'
    });
    console.log('✅ Successfully wrote test document to Firestore');

    // Test 4: Try to read the test document
    const testDoc = await testRef.get();
    if (testDoc.exists) {
      const data = testDoc.data();
      console.log('✅ Successfully read test document from Firestore');
      console.log(`   📊 Project ID: ${data.projectId}`);
      console.log(`   ⏰ Timestamp: ${data.timestamp.toDate()}`);
    }

    // Test 5: Clean up test document
    await testRef.delete();
    console.log('✅ Test document cleaned up');

    // Test 6: Check Firebase Storage
    const bucket = admin.storage().bucket();
    console.log(`✅ Firebase Storage bucket: ${bucket.name}`);

    console.log('\n🎉 All Firebase tests passed! Your setup is working correctly.');
    console.log('\n📝 You can now run:');
    console.log('   node scripts/seedFirestore.js  # To seed your database');
    console.log('   npm run dev                    # To start your server');

  } catch (error) {
    console.error('❌ Firebase connection test failed:');
    console.error('Error:', error.message);
    
    if (error.message.includes('service account')) {
      console.log('\n💡 Tip: Make sure your FIREBASE_SERVICE_ACCOUNT in .env contains valid JSON');
    }
    if (error.message.includes('project')) {
      console.log('\n💡 Tip: Check your Firebase project ID and permissions');
    }
  }

  process.exit(0);
}

// Run the test
testFirebaseConnection();
