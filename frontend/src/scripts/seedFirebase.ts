import { 
  createUserWithEmailAndPassword,
  updateProfile
} from 'firebase/auth';
import { 
  doc, 
  setDoc,
  collection,
  addDoc,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { auth, db } from '../config/firebase';

// Sample users
const sampleUsers = [
  {
    email: 'admin@quicksell.com',
    password: 'Admin123!',
    username: 'admin',
    firstName: 'Admin',
    lastName: 'User',
    role: 'admin' as const,
    balance: 100000
  },
  {
    email: 'john.doe@example.com',
    password: 'Password123!',
    username: 'johndoe',
    firstName: 'John',
    lastName: 'Doe',
    role: 'user' as const,
    balance: 5000
  },
  {
    email: 'jane.smith@example.com',
    password: 'Password123!',
    username: 'janesmith',
    firstName: 'Jane',
    lastName: 'Smith',
    role: 'user' as const,
    balance: 8000
  },
  {
    email: 'mike.wilson@example.com',
    password: 'Password123!',
    username: 'mikewilson',
    firstName: 'Mike',
    lastName: 'Wilson',
    role: 'user' as const,
    balance: 3500
  }
];

// Sample products
const sampleProducts = [
  {
    title: 'iPhone 14 Pro Max 256GB - Excellent Condition',
    description: 'Premium smartphone in excellent condition! Color: Deep Purple, Storage: 256GB, Battery Health: 92%, Includes original box and charger. Perfect for photography enthusiasts.',
    images: [
      'https://images.unsplash.com/photo-1678685888221-cda773a3dcdb?w=800',
      'https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=800'
    ],
    category: 'Electronics',
    categoryId: '1',
    startingPrice: 15000,
    currentPrice: 16500,
    buyNowPrice: 22000,
    incrementAmount: 500,
    condition: 'excellent' as const,
    status: 'active' as const,
    shippingCost: 150,
    freeShipping: false,
    location: 'Cape Town, Western Cape',
    views: 234,
    totalBids: 8,
    uniqueBidders: 5,
    watchers: 23,
    featured: true
  },
  {
    title: '2019 Volkswagen Polo GTI - Low Mileage',
    description: 'Well-maintained hot hatch! Year: 2019, Mileage: 35,000 km, Engine: 2.0 TSI, Full service history at VW, One owner, Accident-free.',
    images: [
      'https://images.unsplash.com/photo-1609521263047-f8f205293f24?w=800'
    ],
    category: 'Vehicles',
    categoryId: '5',
    startingPrice: 280000,
    currentPrice: 285000,
    buyNowPrice: 350000,
    incrementAmount: 5000,
    condition: 'excellent' as const,
    status: 'active' as const,
    shippingCost: 0,
    freeShipping: false,
    location: 'Johannesburg, Gauteng',
    views: 1203,
    totalBids: 3,
    uniqueBidders: 2,
    watchers: 45,
    featured: true
  },
  {
    title: 'MacBook Pro M2 13" - 2023 Model',
    description: 'Latest MacBook Pro with M2 chip! 8GB RAM, 512GB SSD, Space Gray, AppleCare+ until Dec 2024, Mint condition.',
    images: [
      'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800'
    ],
    category: 'Electronics',
    categoryId: '1',
    startingPrice: 18000,
    currentPrice: 19500,
    buyNowPrice: 28000,
    incrementAmount: 1000,
    condition: 'like-new' as const,
    status: 'active' as const,
    shippingCost: 200,
    freeShipping: false,
    location: 'Durban, KwaZulu-Natal',
    views: 567,
    totalBids: 12,
    uniqueBidders: 8,
    watchers: 34,
    featured: false
  },
  {
    title: 'Nike Air Jordan 1 Retro High - Size 10',
    description: 'Iconic sneakers in great condition. Authentic Nike Air Jordan 1, Size: US 10, Colorway: Chicago Red, Original box included.',
    images: [
      'https://images.unsplash.com/photo-1600181516264-3ea807ff44b9?w=800'
    ],
    category: 'Fashion',
    categoryId: '2',
    startingPrice: 3500,
    currentPrice: 4200,
    buyNowPrice: 5500,
    incrementAmount: 200,
    condition: 'good' as const,
    status: 'active' as const,
    shippingCost: 150,
    freeShipping: false,
    location: 'Pretoria, Gauteng',
    views: 445,
    totalBids: 15,
    uniqueBidders: 9,
    watchers: 67,
    featured: true
  },
  {
    title: 'Samsung 55" 4K Smart TV - Crystal UHD',
    description: 'Transform your viewing experience! Model: AU8000, 55 inch display, Smart TV with streaming apps, HDR support.',
    images: [
      'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=800'
    ],
    category: 'Electronics',
    categoryId: '1',
    startingPrice: 6000,
    currentPrice: 6500,
    buyNowPrice: 9500,
    incrementAmount: 250,
    condition: 'excellent' as const,
    status: 'active' as const,
    shippingCost: 350,
    freeShipping: false,
    location: 'Port Elizabeth, Eastern Cape',
    views: 123,
    totalBids: 4,
    uniqueBidders: 3,
    watchers: 18,
    featured: false
  },
  {
    title: 'Rare Krugerrand Gold Coin Collection - 1970s',
    description: 'Investment-grade gold coins. Set of 3 Krugerrands from 1974-1976, 1 oz fine gold each, Uncirculated condition.',
    images: [
      'https://images.unsplash.com/photo-1610375461246-83df859d849d?w=800'
    ],
    category: 'Collectibles & Art',
    categoryId: '6',
    startingPrice: 120000,
    currentPrice: 125000,
    buyNowPrice: 150000,
    incrementAmount: 2000,
    condition: 'new' as const,
    status: 'active' as const,
    shippingCost: 500,
    freeShipping: false,
    location: 'Cape Town, Western Cape',
    views: 3456,
    totalBids: 5,
    uniqueBidders: 4,
    watchers: 123,
    featured: true
  },
  {
    title: 'Weber Genesis II Gas Braai - Premium BBQ',
    description: 'Perfect for South African braais! 3-burner gas braai, Stainless steel, Side burner, Cover included.',
    images: [
      'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800'
    ],
    category: 'Home & Garden',
    categoryId: '3',
    startingPrice: 8000,
    currentPrice: 8000,
    buyNowPrice: 12000,
    incrementAmount: 500,
    condition: 'excellent' as const,
    status: 'active' as const,
    shippingCost: 400,
    freeShipping: false,
    location: 'Bloemfontein, Free State',
    views: 234,
    totalBids: 0,
    uniqueBidders: 0,
    watchers: 12,
    featured: false
  },
  {
    title: 'Springboks 2023 World Cup Jersey - Signed',
    description: "Collector's item! Official 2023 RWC jersey signed by Siya Kolisi, Size: XL, Certificate of authenticity included.",
    images: [
      'https://images.unsplash.com/photo-1577223625816-7546f13df25d?w=800'
    ],
    category: 'Sports & Outdoors',
    categoryId: '4',
    startingPrice: 5000,
    currentPrice: 6200,
    buyNowPrice: 8500,
    incrementAmount: 250,
    condition: 'new' as const,
    status: 'active' as const,
    shippingCost: 100,
    freeShipping: false,
    location: 'Johannesburg, Gauteng',
    views: 789,
    totalBids: 18,
    uniqueBidders: 12,
    watchers: 92,
    featured: true
  },
  {
    title: 'Tanzanite & Diamond Ring - 18k White Gold',
    description: 'Exquisite tanzanite ring. 2.5ct Tanzanite center, 0.5ct diamonds, 18k white gold, GIA certified, Size 7.',
    images: [
      'https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=800'
    ],
    category: 'Jewelry & Watches',
    categoryId: '8',
    startingPrice: 35000,
    currentPrice: 38000,
    buyNowPrice: 50000,
    incrementAmount: 1000,
    condition: 'new' as const,
    status: 'active' as const,
    shippingCost: 0,
    freeShipping: true,
    location: 'Cape Town, Western Cape',
    views: 567,
    totalBids: 7,
    uniqueBidders: 5,
    watchers: 43,
    featured: false
  },
  {
    title: 'PlayStation 5 Console with Extra Controller',
    description: 'Next-gen gaming console! Includes: PS5 disc version, 2 DualSense controllers, 3 games, All original packaging.',
    images: [
      'https://images.unsplash.com/photo-1606813907291-d86efa9b94db?w=800'
    ],
    category: 'Electronics',
    categoryId: '1',
    startingPrice: 10000,
    currentPrice: 11500,
    buyNowPrice: 14000,
    incrementAmount: 500,
    condition: 'like-new' as const,
    status: 'active' as const,
    shippingCost: 200,
    freeShipping: false,
    location: 'Durban, KwaZulu-Natal',
    views: 892,
    totalBids: 9,
    uniqueBidders: 6,
    watchers: 78,
    featured: true
  }
];

async function seedFirebase() {
  console.log('🌱 Starting Firebase seeding...\n');

  const createdUsers: any[] = [];

  // Step 1: Create users
  console.log('👥 Creating users...');
  for (const userData of sampleUsers) {
    try {
      // Create authentication user
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        userData.email,
        userData.password
      );
      
      const user = userCredential.user;

      // Update display name
      await updateProfile(user, {
        displayName: userData.username
      });

      // Create user profile in Firestore
      const userProfile = {
        uid: user.uid,
        email: userData.email,
        username: userData.username,
        firstName: userData.firstName,
        lastName: userData.lastName,
        role: userData.role,
        balance: userData.balance,
        emailVerified: user.emailVerified,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await setDoc(doc(db, 'users', user.uid), userProfile);
      
      createdUsers.push({ ...userProfile, uid: user.uid });
      console.log(`✅ Created user: ${userData.email}`);
    } catch (error: any) {
      if (error.code === 'auth/email-already-in-use') {
        console.log(`⚠️ User already exists: ${userData.email}`);
      } else {
        console.error(`❌ Failed to create user ${userData.email}:`, error.message);
      }
    }
  }

  // Get admin user for products
  const adminUser = createdUsers.find(u => u.role === 'admin') || createdUsers[0];

  // Step 2: Create products
  console.log('\n📦 Creating products...');
  const createdProducts: any[] = [];
  
  for (const productData of sampleProducts) {
    try {
      // Calculate dates (start date 3 days ago, end date 7 days from now)
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 3);
      
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 7);

      const product = {
        ...productData,
        sellerId: adminUser.uid,
        sellerName: adminUser.username,
        startDate: Timestamp.fromDate(startDate),
        endDate: Timestamp.fromDate(endDate),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, 'products'), product);
      createdProducts.push({ id: docRef.id, ...product });
      console.log(`✅ Created product: ${productData.title}`);
    } catch (error: any) {
      console.error(`❌ Failed to create product ${productData.title}:`, error.message);
    }
  }

  // Step 3: Create sample bids for some products
  console.log('\n💰 Creating sample bids...');
  const regularUsers = createdUsers.filter(u => u.role === 'user');
  
  for (let i = 0; i < Math.min(5, createdProducts.length); i++) {
    const product = createdProducts[i];
    
    // Create 2-3 bids per product
    const numBids = Math.floor(Math.random() * 2) + 2;
    let currentBidAmount = product.startingPrice;
    
    for (let j = 0; j < numBids && j < regularUsers.length; j++) {
      const bidder = regularUsers[j];
      currentBidAmount += product.incrementAmount;
      
      try {
        const bid = {
          productId: product.id,
          productTitle: product.title,
          bidderId: bidder.uid,
          bidderName: bidder.username,
          amount: currentBidAmount,
          isAutoBid: false,
          status: j === numBids - 1 ? 'winning' : 'outbid',
          placedAt: serverTimestamp()
        };

        await addDoc(collection(db, 'bids'), bid);
        console.log(`✅ Created bid: ${bidder.username} bid R${currentBidAmount} on "${product.title}"`);
      } catch (error: any) {
        console.error(`❌ Failed to create bid:`, error.message);
      }
    }
  }

  console.log('\n🎉 Firebase seeding completed!');
  console.log('\n📝 Summary:');
  console.log(`- Users created: ${createdUsers.length}`);
  console.log(`- Products created: ${createdProducts.length}`);
  console.log('\n🔑 Login credentials:');
  console.log('Admin: admin@quicksell.com / Admin123!');
  console.log('User 1: john.doe@example.com / Password123!');
  console.log('User 2: jane.smith@example.com / Password123!');
}

// Run the seed
seedFirebase().catch(console.error);