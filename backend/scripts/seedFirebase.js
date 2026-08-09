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
const auth = admin.auth();

// Sample data
const categories = [
  { id: 'electronics', name: 'Electronics', icon: '📱', count: 0, order: 1 },
  { id: 'fashion', name: 'Fashion', icon: '👗', count: 0, order: 2 },
  { id: 'home-garden', name: 'Home & Garden', icon: '🏠', count: 0, order: 3 },
  { id: 'sports', name: 'Sports & Outdoors', icon: '⚽', count: 0, order: 4 },
  { id: 'vehicles', name: 'Vehicles', icon: '🚗', count: 0, order: 5 },
  { id: 'collectibles', name: 'Collectibles & Art', icon: '🎨', count: 0, order: 6 },
  { id: 'books', name: 'Books & Media', icon: '📚', count: 0, order: 7 },
  { id: 'jewelry', name: 'Jewelry & Watches', icon: '💎', count: 0, order: 8 }
];

const products = [
  {
    title: 'iPhone 14 Pro Max 256GB - Deep Purple',
    description: 'Brand new iPhone 14 Pro Max in Deep Purple. 256GB storage, unlocked, comes with original box and accessories. Perfect condition, never used.',
    images: [
      'https://images.unsplash.com/photo-1678685888221-cda773a3dcdb?w=800',
      'https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=800'
    ],
    categoryId: 'electronics',
    startingPrice: 15000,
    currentPrice: 15000,
    buyNowPrice: 22000,
    incrementAmount: 500,
    condition: 'new',
    status: 'active',
    shippingCost: 150,
    location: 'Cape Town, Western Cape',
    views: 0,
    totalBids: 0,
    uniqueBidders: 0,
    featured: true,
    specifications: {
      brand: 'Apple',
      model: 'iPhone 14 Pro Max',
      storage: '256GB',
      color: 'Deep Purple',
      condition: 'Brand New'
    }
  },
  {
    title: 'Samsung 55" 4K Smart TV',
    description: 'Samsung QLED 4K Smart TV, 55 inch. Excellent picture quality with quantum dot technology. WiFi enabled with all streaming apps.',
    images: [
      'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=800'
    ],
    categoryId: 'electronics',
    startingPrice: 8000,
    currentPrice: 8500,
    buyNowPrice: 12000,
    incrementAmount: 250,
    condition: 'excellent',
    status: 'active',
    shippingCost: 200,
    location: 'Johannesburg, Gauteng',
    views: 0,
    totalBids: 3,
    uniqueBidders: 2,
    featured: true
  },
  {
    title: 'Nike Air Jordan 1 Retro High',
    description: 'Authentic Nike Air Jordan 1 Retro High OG. Size US 10. Brand new with box. Classic Chicago colorway.',
    images: [
      'https://images.unsplash.com/photo-1600269452121-4f2416e55c28?w=800'
    ],
    categoryId: 'fashion',
    startingPrice: 2500,
    currentPrice: 2800,
    buyNowPrice: 4000,
    incrementAmount: 100,
    condition: 'new',
    status: 'active',
    shippingCost: 100,
    location: 'Durban, KwaZulu-Natal',
    views: 0,
    totalBids: 5,
    uniqueBidders: 3,
    featured: false
  },
  {
    title: 'Vintage Rolex Submariner',
    description: 'Genuine Rolex Submariner Date, reference 16610. Full set with box and papers. Recently serviced.',
    images: [
      'https://images.unsplash.com/photo-1587836374828-4dbafa94cf0e?w=800'
    ],
    categoryId: 'jewelry',
    startingPrice: 120000,
    currentPrice: 125000,
    buyNowPrice: 150000,
    incrementAmount: 5000,
    condition: 'excellent',
    status: 'active',
    shippingCost: 0,
    location: 'Cape Town, Western Cape',
    views: 0,
    totalBids: 2,
    uniqueBidders: 2,
    featured: true
  },
  {
    title: 'MacBook Pro 16" M2 Max',
    description: 'Latest MacBook Pro 16 inch with M2 Max chip. 32GB RAM, 1TB SSD. Space Gray. Used for only 2 months.',
    images: [
      'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800'
    ],
    categoryId: 'electronics',
    startingPrice: 35000,
    currentPrice: 36500,
    buyNowPrice: 45000,
    incrementAmount: 1000,
    condition: 'like-new',
    status: 'active',
    shippingCost: 150,
    location: 'Pretoria, Gauteng',
    views: 0,
    totalBids: 4,
    uniqueBidders: 3,
    featured: false
  },
  {
    title: 'PlayStation 5 Console Bundle',
    description: 'PS5 Disc Edition with 2 controllers and 5 games. Includes Spider-Man, God of War, and more.',
    images: [
      'https://images.unsplash.com/photo-1606813907291-d86efa9b94db?w=800'
    ],
    categoryId: 'electronics',
    startingPrice: 10000,
    currentPrice: 10500,
    buyNowPrice: 13000,
    incrementAmount: 250,
    condition: 'excellent',
    status: 'active',
    shippingCost: 150,
    location: 'Cape Town, Western Cape',
    views: 0,
    totalBids: 6,
    uniqueBidders: 4,
    featured: false
  },
  {
    title: 'Herman Miller Aeron Chair',
    description: 'Ergonomic office chair in excellent condition. Size B, fully adjustable with lumbar support.',
    images: [
      'https://images.unsplash.com/photo-1592078615290-033ee584e267?w=800'
    ],
    categoryId: 'home-garden',
    startingPrice: 8000,
    currentPrice: 8000,
    buyNowPrice: 12000,
    incrementAmount: 500,
    condition: 'excellent',
    status: 'active',
    shippingCost: 300,
    location: 'Johannesburg, Gauteng',
    views: 0,
    totalBids: 0,
    uniqueBidders: 0,
    featured: false
  },
  {
    title: 'Canon EOS R5 Mirrorless Camera',
    description: 'Professional camera body with 45MP sensor. Includes battery grip and extra batteries.',
    images: [
      'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=800'
    ],
    categoryId: 'electronics',
    startingPrice: 45000,
    currentPrice: 46000,
    buyNowPrice: 55000,
    incrementAmount: 1000,
    condition: 'excellent',
    status: 'active',
    shippingCost: 200,
    location: 'Cape Town, Western Cape',
    views: 0,
    totalBids: 2,
    uniqueBidders: 1,
    featured: true
  },
  {
    title: 'Mountain Bike - Specialized Stumpjumper',
    description: 'High-end mountain bike, carbon frame, 29" wheels, Fox suspension. Trail ready.',
    images: [
      'https://images.unsplash.com/photo-1553978297-833d09932d31?w=800'
    ],
    categoryId: 'sports',
    startingPrice: 25000,
    currentPrice: 25000,
    buyNowPrice: 35000,
    incrementAmount: 1000,
    condition: 'good',
    status: 'active',
    shippingCost: 500,
    location: 'Durban, KwaZulu-Natal',
    views: 0,
    totalBids: 0,
    uniqueBidders: 0,
    featured: false
  },
  {
    title: 'Leather Sofa Set - 3 Seater',
    description: 'Genuine leather sofa in dark brown. Very comfortable and in great condition.',
    images: [
      'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800'
    ],
    categoryId: 'home-garden',
    startingPrice: 15000,
    currentPrice: 15500,
    buyNowPrice: 20000,
    incrementAmount: 500,
    condition: 'excellent',
    status: 'active',
    shippingCost: 800,
    location: 'Pretoria, Gauteng',
    views: 0,
    totalBids: 1,
    uniqueBidders: 1,
    featured: false
  }
];

async function seedDatabase() {
  try {
    console.log('🌱 Starting database seed...\n');

    // 1. Create admin user if doesn't exist
    console.log('Creating admin user...');
    let adminUser;
    try {
      adminUser = await auth.getUserByEmail('admin@quicksell.com');
      console.log('Admin user already exists');
    } catch (error) {
      adminUser = await auth.createUser({
        email: 'admin@quicksell.com',
        password: 'Admin@123456',
        displayName: 'Quicksell Admin',
        emailVerified: true
      });
      console.log('✅ Admin user created');
    }

    // Add admin to users collection
    await db.collection('users').doc(adminUser.uid).set({
      uid: adminUser.uid,
      email: adminUser.email,
      username: 'admin',
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin',
      balance: 0,
      emailVerified: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // 2. Seed categories
    console.log('\nSeeding categories...');
    const batch = db.batch();
    
    for (const category of categories) {
      const categoryRef = db.collection('categories').doc(category.id);
      batch.set(categoryRef, {
        ...category,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    
    await batch.commit();
    console.log(`✅ ${categories.length} categories created`);

    // 3. Seed products
    console.log('\nSeeding products...');
    const productBatch = db.batch();
    const categoryCounts = {};
    
    for (const product of products) {
      const productRef = db.collection('products').doc();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + Math.floor(Math.random() * 7) + 1); // 1-7 days from now
      
      productBatch.set(productRef, {
        ...product,
        sellerId: adminUser.uid,
        sellerName: 'Quicksell Official',
        verified: true,
        averageRating: 4.8,
        reviewCount: Math.floor(Math.random() * 50) + 10,
        startDate: admin.firestore.FieldValue.serverTimestamp(),
        endDate: admin.firestore.Timestamp.fromDate(endDate),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      // Count products per category
      categoryCounts[product.categoryId] = (categoryCounts[product.categoryId] || 0) + 1;
    }
    
    await productBatch.commit();
    console.log(`✅ ${products.length} products created`);

    // 4. Update category counts
    console.log('\nUpdating category counts...');
    const countBatch = db.batch();
    
    for (const [categoryId, count] of Object.entries(categoryCounts)) {
      const categoryRef = db.collection('categories').doc(categoryId);
      countBatch.update(categoryRef, {
        count: admin.firestore.FieldValue.increment(count)
      });
    }
    
    await countBatch.commit();
    console.log('✅ Category counts updated');

    // 5. Create sample users for testing
    console.log('\nCreating sample users...');
    const sampleUsers = [
      {
        email: 'john.buyer@example.com',
        password: 'Test@123456',
        displayName: 'John Buyer',
        firstName: 'John',
        lastName: 'Buyer',
        role: 'user'
      },
      {
        email: 'jane.seller@example.com',
        password: 'Test@123456',
        displayName: 'Jane Seller',
        firstName: 'Jane',
        lastName: 'Seller',
        role: 'seller'
      }
    ];

    for (const userData of sampleUsers) {
      try {
        const user = await auth.createUser({
          email: userData.email,
          password: userData.password,
          displayName: userData.displayName,
          emailVerified: true
        });

        await db.collection('users').doc(user.uid).set({
          uid: user.uid,
          email: user.email,
          username: userData.email.split('@')[0],
          firstName: userData.firstName,
          lastName: userData.lastName,
          role: userData.role,
          balance: 10000, // Give them some balance for testing
          emailVerified: true,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`✅ Created user: ${userData.email}`);
      } catch (error) {
        if (error.code === 'auth/email-already-exists') {
          console.log(`User ${userData.email} already exists`);
        } else {
          console.error(`Error creating user ${userData.email}:`, error.message);
        }
      }
    }

    console.log('\n🎉 Database seeding completed successfully!');
    console.log('\n📝 Test Accounts:');
    console.log('Admin: admin@quicksell.com / Admin@123456');
    console.log('Buyer: john.buyer@example.com / Test@123456');
    console.log('Seller: jane.seller@example.com / Test@123456');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  }
}

// Run the seed function
seedDatabase();