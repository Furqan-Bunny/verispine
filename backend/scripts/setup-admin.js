const admin = require('firebase-admin');
require('dotenv').config();

// Initialize Firebase Admin
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET
});

const db = admin.firestore();
const auth = admin.auth();

async function setupAdmin() {
  try {
    // Admin email to set up
    const adminEmail = 'admin@quicksell.com'; // Change this to your admin email
    
    console.log('Setting up admin user for:', adminEmail);
    
    // Check if user exists in Firebase Auth
    let user;
    try {
      user = await auth.getUserByEmail(adminEmail);
      console.log('User found in Firebase Auth:', user.uid);
    } catch (error) {
      console.log('User not found in Firebase Auth. Please create the account first.');
      return;
    }
    
    // Set custom claims for admin
    await auth.setCustomUserClaims(user.uid, { 
      admin: true,
      role: 'admin' 
    });
    console.log('Admin custom claims set');
    
    // Create or update user document in Firestore
    const userData = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || 'Admin',
      firstName: 'Admin',
      lastName: 'User',
      username: 'admin',
      role: 'admin',
      balance: 0,
      emailVerified: user.emailVerified,
      isActive: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    await db.collection('users').doc(user.uid).set(userData, { merge: true });
    console.log('Admin user document created/updated in Firestore');
    
    // Create initial categories if they don't exist
    const categories = [
      { name: 'Electronics', slug: 'electronics', icon: '📱', description: 'Electronic devices and gadgets' },
      { name: 'Fashion', slug: 'fashion', icon: '👗', description: 'Clothing and accessories' },
      { name: 'Home & Garden', slug: 'home-garden', icon: '🏠', description: 'Home improvement and garden items' },
      { name: 'Sports', slug: 'sports', icon: '⚽', description: 'Sports equipment and memorabilia' },
      { name: 'Vehicles', slug: 'vehicles', icon: '🚗', description: 'Cars, bikes, and parts' },
      { name: 'Art & Collectibles', slug: 'collectibles', icon: '🎨', description: 'Art pieces and collectible items' },
      { name: 'Books & Media', slug: 'books', icon: '📚', description: 'Books, movies, and music' },
      { name: 'Jewelry', slug: 'jewelry', icon: '💎', description: 'Jewelry and watches' }
    ];
    
    console.log('Creating default categories...');
    for (const category of categories) {
      const categoryData = {
        ...category,
        status: 'active',
        productCount: 0,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };
      
      await db.collection('categories').doc(category.slug).set(categoryData, { merge: true });
    }
    console.log('Categories created');
    
    console.log('\n✅ Admin setup complete!');
    console.log('You can now login with:', adminEmail);
    console.log('The user has admin privileges.');
    
  } catch (error) {
    console.error('Error setting up admin:', error);
  } finally {
    process.exit(0);
  }
}

// Run the setup
setupAdmin();