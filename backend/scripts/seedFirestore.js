const { db, batchUtils } = require('../utils/firestore');
require('dotenv').config();

// Sample categories
const categories = [
  {
    name: 'Electronics',
    description: 'Electronic devices and gadgets',
    slug: 'electronics',
    isActive: true,
    subcategories: ['Smartphones', 'Laptops', 'Gaming', 'Audio']
  },
  {
    name: 'Fashion & Apparel',
    description: 'Clothing, shoes, and accessories',
    slug: 'fashion-apparel',
    isActive: true,
    subcategories: ['Men\'s Clothing', 'Women\'s Clothing', 'Shoes', 'Accessories']
  },
  {
    name: 'Home & Garden',
    description: 'Home improvement and gardening items',
    slug: 'home-garden',
    isActive: true,
    subcategories: ['Furniture', 'Appliances', 'Garden', 'Decor']
  },
  {
    name: 'Vehicles',
    description: 'Cars, motorcycles, and other vehicles',
    slug: 'vehicles',
    isActive: true,
    subcategories: ['Cars', 'Motorcycles', 'Trucks', 'Parts']
  },
  {
    name: 'Sports & Recreation',
    description: 'Sports equipment and recreational items',
    slug: 'sports-recreation',
    isActive: true,
    subcategories: ['Exercise', 'Outdoor', 'Team Sports', 'Water Sports']
  }
];

// Sample admin user
const adminUser = {
  username: 'admin',
  email: 'admin@quicksell.com',
  firstName: 'Admin',
  lastName: 'User',
  role: 'admin',
  emailVerified: true,
  isActive: true,
  balance: 10000,
  preferences: {
    notifications: {
      email: true,
      push: true,
      sms: false
    },
    categories: []
  },
  wishlist: [],
  following: [],
  followers: [],
  ratings: {
    average: 0,
    count: 0
  },
  createdAt: new Date(),
  updatedAt: new Date()
};

// Sample seller user
const sellerUser = {
  username: 'seller1',
  email: 'seller@quicksell.com',
  firstName: 'John',
  lastName: 'Seller',
  role: 'seller',
  emailVerified: true,
  isActive: true,
  balance: 5000,
  preferences: {
    notifications: {
      email: true,
      push: true,
      sms: false
    },
    categories: ['electronics']
  },
  wishlist: [],
  following: [],
  followers: [],
  ratings: {
    average: 4.5,
    count: 25
  },
  createdAt: new Date(),
  updatedAt: new Date()
};

// Sample buyer user
const buyerUser = {
  username: 'buyer1',
  email: 'buyer@quicksell.com',
  firstName: 'Jane',
  lastName: 'Buyer',
  role: 'user',
  emailVerified: true,
  isActive: true,
  balance: 2000,
  preferences: {
    notifications: {
      email: true,
      push: true,
      sms: false
    },
    categories: ['electronics', 'fashion-apparel']
  },
  wishlist: [],
  following: [],
  followers: [],
  ratings: {
    average: 0,
    count: 0
  },
  createdAt: new Date(),
  updatedAt: new Date()
};

async function seedFirestore() {
  try {
    console.log('🌱 Starting Firestore seeding...');

    // Create batch
    const batch = batchUtils.createBatch();
    
    // Add categories
    console.log('📂 Adding categories...');
    categories.forEach((category, index) => {
      const categoryRef = db.collection('categories').doc();
      batch.set(categoryRef, {
        ...category,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      console.log(`  ✅ Category: ${category.name}`);
    });

    // Add users (Note: passwords should be hashed in real implementation)
    console.log('👥 Adding users...');
    const adminRef = db.collection('users').doc();
    batch.set(adminRef, adminUser);
    console.log('  ✅ Admin user');

    const sellerRef = db.collection('users').doc();
    batch.set(sellerRef, sellerUser);
    console.log('  ✅ Seller user');

    const buyerRef = db.collection('users').doc();
    batch.set(buyerRef, buyerUser);
    console.log('  ✅ Buyer user');

    // Commit batch
    console.log('💾 Committing to Firestore...');
    await batchUtils.commitBatch(batch);

    // Add sample products (after users are created)
    console.log('📱 Adding sample products...');
    
    // Get the seller ID for products
    const sellersSnapshot = await db.collection('users').where('role', '==', 'seller').limit(1).get();
    const sellerId = sellersSnapshot.docs[0].id;

    // Get electronics category ID
    const categoriesSnapshot = await db.collection('categories').where('slug', '==', 'electronics').limit(1).get();
    const electronicsId = categoriesSnapshot.docs[0].id;

    const sampleProducts = [
      {
        title: 'iPhone 14 Pro Max - Space Black 256GB',
        description: 'Brand new iPhone 14 Pro Max with Pro camera system featuring 48MP Main camera, A16 Bionic chip, and stunning 6.7" Super Retina XDR display. Includes original packaging and accessories.',
        images: [
          {
            url: 'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/iphone-14-pro-finish-select-202209-6-7inch-spaceblack?wid=5120&hei=2880&fmt=p-jpg&qlt=80&.v=1663703841896',
            caption: 'iPhone 14 Pro Max - Space Black',
            isPrimary: true
          },
          {
            url: 'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/iphone-14-pro-back-select-202209-6-7inch-spaceblack?wid=5120&hei=2880&fmt=p-jpg&qlt=80&.v=1663703845715',
            caption: 'iPhone 14 Pro Max - Back View',
            isPrimary: false
          }
        ],
        category: electronicsId,
        subcategory: 'Smartphones',
        seller: sellerId,
        auctionType: 'standard',
        startingPrice: 500,
        currentPrice: 500,
        buyNowPrice: 1200,
        incrementAmount: 25,
        startDate: new Date(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
        condition: 'like-new',
        specifications: [
          { key: 'Storage', value: '256GB' },
          { key: 'Color', value: 'Space Black' },
          { key: 'Condition', value: 'Like New' }
        ],
        shippingInfo: {
          weight: 0.24,
          dimensions: {
            length: 16.1,
            width: 7.85,
            height: 0.79
          },
          shippingCost: 25,
          estimatedDelivery: '3-5 business days',
          availableCountries: ['South Africa'],
          freeShipping: false
        },
        tags: ['iphone', 'apple', 'smartphone', 'ios'],
        views: 156,
        watchers: [],
        status: 'active',
        winner: null,
        winningBid: null,
        totalBids: 0,
        uniqueBidders: 0,
        featured: true,
        verified: true,
        returnPolicy: {
          accepted: true,
          days: 30,
          description: 'Full refund within 30 days if not satisfied'
        },
        questions: [],
        reviews: [],
        averageRating: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        title: 'MacBook Air 13" M2 Chip - Midnight Blue',
        description: 'Apple MacBook Air 13" with revolutionary M2 chip, 8GB unified memory, 256GB SSD. Ultra-thin design with all-day battery life. Perfect for work, creativity, and everyday computing.',
        images: [
          {
            url: 'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/macbook-air-midnight-select-20220606?wid=904&hei=840&fmt=jpeg&qlt=90&.v=1653084303665',
            caption: 'MacBook Air M2 - Midnight',
            isPrimary: true
          },
          {
            url: 'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/macbook-air-m2-gallery3-20220606?wid=2048&hei=1200&fmt=jpeg&qlt=90&.v=1653084350985',
            caption: 'MacBook Air M2 - Side Profile',
            isPrimary: false
          }
        ],
        category: electronicsId,
        subcategory: 'Laptops',
        seller: sellerId,
        auctionType: 'standard',
        startingPrice: 800,
        currentPrice: 800,
        buyNowPrice: 1500,
        incrementAmount: 50,
        startDate: new Date(),
        endDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
        condition: 'excellent',
        specifications: [
          { key: 'Processor', value: 'Apple M2' },
          { key: 'RAM', value: '8GB' },
          { key: 'Storage', value: '256GB SSD' },
          { key: 'Screen', value: '13.6" Liquid Retina' }
        ],
        shippingInfo: {
          weight: 1.24,
          dimensions: {
            length: 30.41,
            width: 21.5,
            height: 1.13
          },
          shippingCost: 50,
          estimatedDelivery: '2-4 business days',
          availableCountries: ['South Africa'],
          freeShipping: true
        },
        tags: ['macbook', 'apple', 'laptop', 'mac', 'm2'],
        views: 89,
        watchers: [],
        status: 'active',
        winner: null,
        winningBid: null,
        totalBids: 0,
        uniqueBidders: 0,
        featured: false,
        verified: true,
        returnPolicy: {
          accepted: true,
          days: 14,
          description: 'Return within 14 days in original condition'
        },
        questions: [],
        reviews: [],
        averageRating: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        title: 'PlayStation 5 Console - Digital Edition',
        description: 'Sony PlayStation 5 Digital Edition with ultra-high speed SSD, 3D audio, and DualSense wireless controller. Experience lightning-fast loading and incredible games.',
        images: [
          {
            url: 'https://gmedia.playstation.com/is/image/SIEPDC/ps5-product-thumbnail-01-en-14sep21?$facebook$',
            caption: 'PlayStation 5 Digital Edition',
            isPrimary: true
          },
          {
            url: 'https://gmedia.playstation.com/is/image/SIEPDC/dualsense-controller-image-block-01-en-12nov20?$1200px$',
            caption: 'DualSense Wireless Controller',
            isPrimary: false
          }
        ],
        category: electronicsId,
        subcategory: 'Gaming',
        seller: sellerId,
        auctionType: 'standard',
        startingPrice: 350,
        currentPrice: 420,
        buyNowPrice: 650,
        incrementAmount: 20,
        startDate: new Date(),
        endDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
        condition: 'excellent',
        specifications: [
          { key: 'Edition', value: 'Digital Edition' },
          { key: 'Storage', value: '825GB SSD' },
          { key: 'Resolution', value: 'Up to 8K' },
          { key: 'Included', value: 'DualSense Controller' }
        ],
        shippingInfo: {
          weight: 3.9,
          dimensions: {
            length: 39.0,
            width: 26.0,
            height: 10.4
          },
          shippingCost: 75,
          estimatedDelivery: '1-3 business days',
          availableCountries: ['South Africa'],
          freeShipping: false
        },
        tags: ['playstation', 'ps5', 'gaming', 'console', 'sony'],
        views: 245,
        watchers: [],
        status: 'active',
        winner: null,
        winningBid: null,
        totalBids: 3,
        uniqueBidders: 3,
        featured: true,
        verified: true,
        returnPolicy: {
          accepted: true,
          days: 7,
          description: 'Return within 7 days if unopened'
        },
        questions: [],
        reviews: [],
        averageRating: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        title: 'Apple AirPods Pro (2nd Generation)',
        description: 'Apple AirPods Pro with Active Noise Cancellation, Adaptive Transparency, and Personalized Spatial Audio. Features the Apple H2 chip for enhanced audio experience.',
        images: [
          {
            url: 'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/MQD83?wid=1144&hei=1144&fmt=jpeg&qlt=90&.v=1660803972361',
            caption: 'AirPods Pro 2nd Generation',
            isPrimary: true
          },
          {
            url: 'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/airpods-pro-2-case-front-230918?wid=1144&hei=1144&fmt=jpeg&qlt=90&.v=1695161403018',
            caption: 'MagSafe Charging Case',
            isPrimary: false
          }
        ],
        category: electronicsId,
        subcategory: 'Audio',
        seller: sellerId,
        auctionType: 'standard',
        startingPrice: 150,
        currentPrice: 180,
        buyNowPrice: 280,
        incrementAmount: 10,
        startDate: new Date(),
        endDate: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000), // 4 days from now
        condition: 'new',
        specifications: [
          { key: 'Generation', value: '2nd Generation' },
          { key: 'Chip', value: 'Apple H2' },
          { key: 'Battery Life', value: 'Up to 6 hours' },
          { key: 'Case Battery', value: 'Up to 30 hours total' }
        ],
        shippingInfo: {
          weight: 0.056,
          dimensions: {
            length: 6.06,
            width: 4.52,
            height: 2.15
          },
          shippingCost: 15,
          estimatedDelivery: '2-3 business days',
          availableCountries: ['South Africa'],
          freeShipping: true
        },
        tags: ['airpods', 'apple', 'wireless', 'earbuds', 'pro'],
        views: 123,
        watchers: [],
        status: 'active',
        winner: null,
        winningBid: null,
        totalBids: 5,
        uniqueBidders: 4,
        featured: false,
        verified: true,
        returnPolicy: {
          accepted: true,
          days: 14,
          description: 'Return within 14 days in original packaging'
        },
        questions: [],
        reviews: [],
        averageRating: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        title: 'Samsung 65" Neo QLED 4K Smart TV (QN90A)',
        description: 'Samsung 65" Neo QLED 4K Smart TV with Quantum Matrix Technology, Object Tracking Sound+, and Tizen Smart TV platform. Stunning picture quality with deep blacks and bright whites.',
        images: [
          {
            url: 'https://images.samsung.com/is/image/samsung/p6pim/za/qn65qn90aafxza/gallery/za-neo-qled-4k-qn90a-qn65qn90aafxza-530425479?$650_519_PNG$',
            caption: 'Samsung 65" Neo QLED TV',
            isPrimary: true
          },
          {
            url: 'https://images.samsung.com/is/image/samsung/p6pim/za/qn65qn90aafxza/gallery/za-neo-qled-4k-qn90a-qn65qn90aafxza-530425482?$650_519_PNG$',
            caption: 'Slim One Connect Design',
            isPrimary: false
          }
        ],
        category: electronicsId,
        subcategory: 'Audio',
        seller: sellerId,
        auctionType: 'standard',
        startingPrice: 1200,
        currentPrice: 1200,
        buyNowPrice: 2200,
        incrementAmount: 100,
        startDate: new Date(),
        endDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // 10 days from now
        condition: 'excellent',
        specifications: [
          { key: 'Screen Size', value: '65 inches' },
          { key: 'Resolution', value: '4K UHD (3840x2160)' },
          { key: 'Smart TV', value: 'Tizen OS' },
          { key: 'HDR', value: 'HDR10+' }
        ],
        shippingInfo: {
          weight: 25.8,
          dimensions: {
            length: 144.9,
            width: 82.9,
            height: 3.59
          },
          shippingCost: 200,
          estimatedDelivery: '5-7 business days',
          availableCountries: ['South Africa'],
          freeShipping: false
        },
        tags: ['samsung', 'tv', 'qled', '4k', 'smart-tv', '65-inch'],
        views: 87,
        watchers: [],
        status: 'active',
        winner: null,
        winningBid: null,
        totalBids: 0,
        uniqueBidders: 0,
        featured: true,
        verified: true,
        returnPolicy: {
          accepted: true,
          days: 30,
          description: 'Return within 30 days with original packaging'
        },
        questions: [],
        reviews: [],
        averageRating: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    // Add products
    for (const product of sampleProducts) {
      await db.collection('products').add(product);
      console.log(`  ✅ Product: ${product.title}`);
    }

    console.log('✨ Firestore seeding completed successfully!');
    console.log('\n📊 Seeded data:');
    console.log(`  - ${categories.length} categories`);
    console.log('  - 3 users (admin, seller, buyer)');
    console.log(`  - ${sampleProducts.length} sample products`);
    
    process.exit(0);

  } catch (error) {
    console.error('❌ Error seeding Firestore:', error);
    process.exit(1);
  }
}

// Run the seeding function
if (require.main === module) {
  seedFirestore();
}

module.exports = { seedFirestore };
