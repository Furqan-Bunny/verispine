import { db } from '../config/firebase';
import { collection, addDoc, Timestamp } from 'firebase/firestore';

// Helper function to generate future date
const getFutureDate = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
};

// Sample products data
const products = [
  // Electronics
  {
    name: 'iPhone 15 Pro Max 256GB',
    description: 'Brand new iPhone 15 Pro Max, sealed in box. Natural Titanium color with 256GB storage. Features the latest A17 Pro chip and advanced camera system.',
    category: 'Electronics',
    startingPrice: 15000,
    currentPrice: 15000,
    minBidIncrement: 500,
    images: [
      'https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=800',
      'https://images.unsplash.com/photo-1695048133140-e831ad7a1b2f?w=800'
    ],
    condition: 'New',
    brand: 'Apple',
    specifications: {
      'Storage': '256GB',
      'Color': 'Natural Titanium',
      'Display': '6.7-inch Super Retina XDR',
      'Chip': 'A17 Pro',
      'Camera': '48MP Main + 12MP Ultra Wide + 12MP Telephoto'
    },
    location: 'Cape Town',
    shippingAvailable: true,
    shippingCost: 100,
    endDate: getFutureDate(7),
    sellerId: 'system',
    sellerName: 'QuickSell Store',
    status: 'active',
    featured: true,
    views: 0,
    watchers: [],
    bids: []
  },
  {
    name: 'MacBook Air M2 13-inch',
    description: 'MacBook Air with M2 chip, 8GB RAM, 512GB SSD. Midnight color. Perfect for students and professionals. Excellent battery life.',
    category: 'Electronics',
    startingPrice: 18000,
    currentPrice: 18000,
    minBidIncrement: 500,
    images: [
      'https://images.unsplash.com/photo-1611186871348-b1ce696e52c9?w=800',
      'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800'
    ],
    condition: 'New',
    brand: 'Apple',
    specifications: {
      'Processor': 'Apple M2',
      'RAM': '8GB',
      'Storage': '512GB SSD',
      'Display': '13.6-inch Liquid Retina',
      'Battery Life': 'Up to 18 hours'
    },
    location: 'Johannesburg',
    shippingAvailable: true,
    shippingCost: 150,
    endDate: getFutureDate(5),
    sellerId: 'system',
    sellerName: 'QuickSell Store',
    status: 'active',
    featured: true,
    views: 0,
    watchers: [],
    bids: []
  },
  {
    name: 'Samsung Galaxy S24 Ultra',
    description: 'Latest Samsung flagship with S Pen, 512GB storage. Titanium Gray. Amazing camera with 200MP main sensor.',
    category: 'Electronics',
    startingPrice: 20000,
    currentPrice: 20000,
    minBidIncrement: 500,
    images: [
      'https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?w=800',
      'https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?w=800'
    ],
    condition: 'New',
    brand: 'Samsung',
    specifications: {
      'Storage': '512GB',
      'RAM': '12GB',
      'Display': '6.8-inch QHD+ Dynamic AMOLED',
      'Camera': '200MP Main',
      'Battery': '5000mAh'
    },
    location: 'Durban',
    shippingAvailable: true,
    shippingCost: 100,
    endDate: getFutureDate(6),
    sellerId: 'system',
    sellerName: 'QuickSell Store',
    status: 'active',
    featured: false,
    views: 0,
    watchers: [],
    bids: []
  },
  {
    name: 'Sony PlayStation 5 Console',
    description: 'PlayStation 5 Disc Edition with extra DualSense controller. Latest gaming console with 4K gaming and ray tracing support.',
    category: 'Electronics',
    startingPrice: 8000,
    currentPrice: 8000,
    minBidIncrement: 200,
    images: [
      'https://images.unsplash.com/photo-1606813907291-d86efa9b94db?w=800',
      'https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?w=800'
    ],
    condition: 'New',
    brand: 'Sony',
    specifications: {
      'Storage': '825GB SSD',
      'Resolution': 'Up to 4K',
      'Frame Rate': 'Up to 120fps',
      'Ray Tracing': 'Yes',
      'Backwards Compatible': 'PS4 Games'
    },
    location: 'Pretoria',
    shippingAvailable: true,
    shippingCost: 200,
    endDate: getFutureDate(4),
    sellerId: 'system',
    sellerName: 'QuickSell Store',
    status: 'active',
    featured: true,
    views: 0,
    watchers: [],
    bids: []
  },

  // Fashion
  {
    name: 'Nike Air Jordan 1 Retro High',
    description: 'Authentic Air Jordan 1 Retro High OG in Chicago colorway. Size US 10. Brand new with box and tags.',
    category: 'Fashion',
    startingPrice: 3500,
    currentPrice: 3500,
    minBidIncrement: 100,
    images: [
      'https://images.unsplash.com/photo-1556906781-9a412961c28c?w=800',
      'https://images.unsplash.com/photo-1597045566677-8cf032ed6634?w=800'
    ],
    condition: 'New',
    brand: 'Nike',
    specifications: {
      'Size': 'US 10 / EU 44',
      'Color': 'Chicago (Red/White/Black)',
      'Model': 'Air Jordan 1 Retro High OG',
      'Year': '2024',
      'Authenticity': 'Verified'
    },
    location: 'Cape Town',
    shippingAvailable: true,
    shippingCost: 80,
    endDate: getFutureDate(3),
    sellerId: 'system',
    sellerName: 'QuickSell Store',
    status: 'active',
    featured: false,
    views: 0,
    watchers: [],
    bids: []
  },
  {
    name: 'Gucci GG Marmont Bag',
    description: 'Authentic Gucci GG Marmont small matelassé shoulder bag in black leather. Comes with dust bag and authenticity card.',
    category: 'Fashion',
    startingPrice: 15000,
    currentPrice: 15000,
    minBidIncrement: 500,
    images: [
      'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=800',
      'https://images.unsplash.com/photo-1591561954557-26941169b49e?w=800'
    ],
    condition: 'New',
    brand: 'Gucci',
    specifications: {
      'Model': 'GG Marmont Small',
      'Material': 'Matelassé Leather',
      'Color': 'Black',
      'Hardware': 'Antique Gold',
      'Dimensions': '26cm x 70cm x 7cm'
    },
    location: 'Sandton',
    shippingAvailable: true,
    shippingCost: 100,
    endDate: getFutureDate(8),
    sellerId: 'system',
    sellerName: 'QuickSell Store',
    status: 'active',
    featured: true,
    views: 0,
    watchers: [],
    bids: []
  },

  // Home & Garden
  {
    name: 'Dyson V15 Detect Vacuum',
    description: 'Dyson V15 Detect cordless vacuum with laser dust detection. Most powerful Dyson vacuum with up to 60 minutes runtime.',
    category: 'Home & Garden',
    startingPrice: 8000,
    currentPrice: 8000,
    minBidIncrement: 200,
    images: [
      'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
      'https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?w=800'
    ],
    condition: 'New',
    brand: 'Dyson',
    specifications: {
      'Model': 'V15 Detect',
      'Runtime': 'Up to 60 minutes',
      'Suction Power': '230AW',
      'Bin Capacity': '0.77L',
      'Weight': '3.08kg'
    },
    location: 'Cape Town',
    shippingAvailable: true,
    shippingCost: 150,
    endDate: getFutureDate(5),
    sellerId: 'system',
    sellerName: 'QuickSell Store',
    status: 'active',
    featured: false,
    views: 0,
    watchers: [],
    bids: []
  },
  {
    name: 'Herman Miller Aeron Chair',
    description: 'Ergonomic office chair, Size B, fully loaded with lumbar support. The gold standard in office seating.',
    category: 'Home & Garden',
    startingPrice: 12000,
    currentPrice: 12000,
    minBidIncrement: 300,
    images: [
      'https://images.unsplash.com/photo-1592078615290-033ee584e267?w=800',
      'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800'
    ],
    condition: 'New',
    brand: 'Herman Miller',
    specifications: {
      'Model': 'Aeron',
      'Size': 'B (Medium)',
      'Material': 'Pellicle Mesh',
      'Adjustments': 'Fully Adjustable',
      'Warranty': '12 Years'
    },
    location: 'Johannesburg',
    shippingAvailable: false,
    shippingCost: 0,
    endDate: getFutureDate(7),
    sellerId: 'system',
    sellerName: 'QuickSell Store',
    status: 'active',
    featured: false,
    views: 0,
    watchers: [],
    bids: []
  },

  // Sports & Outdoors
  {
    name: 'Trek Domane SL 5 Road Bike',
    description: '2024 Trek Domane SL 5 carbon road bike. Size 56cm. Shimano 105 groupset. Perfect for long rides and racing.',
    category: 'Sports & Outdoors',
    startingPrice: 35000,
    currentPrice: 35000,
    minBidIncrement: 1000,
    images: [
      'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
      'https://images.unsplash.com/photo-1545558014-8692077e9b5c?w=800'
    ],
    condition: 'New',
    brand: 'Trek',
    specifications: {
      'Frame': 'Carbon Fiber',
      'Groupset': 'Shimano 105',
      'Size': '56cm',
      'Wheels': '700c',
      'Weight': '9.5kg'
    },
    location: 'Cape Town',
    shippingAvailable: false,
    shippingCost: 0,
    endDate: getFutureDate(6),
    sellerId: 'system',
    sellerName: 'QuickSell Store',
    status: 'active',
    featured: true,
    views: 0,
    watchers: [],
    bids: []
  },
  {
    name: 'Garmin Fenix 7X Sapphire Solar',
    description: 'Premium multisport GPS watch with solar charging. Sapphire glass, titanium bezel. Ultimate outdoor companion.',
    category: 'Sports & Outdoors',
    startingPrice: 12000,
    currentPrice: 12000,
    minBidIncrement: 300,
    images: [
      'https://images.unsplash.com/photo-1575311373937-040b8e1fd5b6?w=800',
      'https://images.unsplash.com/photo-1579586337278-3befd40fd17a?w=800'
    ],
    condition: 'New',
    brand: 'Garmin',
    specifications: {
      'Model': 'Fenix 7X Sapphire Solar',
      'Display': '1.4" Solar Sapphire',
      'Battery': 'Up to 37 days',
      'Water Rating': '10 ATM',
      'Features': 'GPS, Heart Rate, Pulse Ox, Maps'
    },
    location: 'Durban',
    shippingAvailable: true,
    shippingCost: 80,
    endDate: getFutureDate(4),
    sellerId: 'system',
    sellerName: 'QuickSell Store',
    status: 'active',
    featured: false,
    views: 0,
    watchers: [],
    bids: []
  },

  // Art & Collectibles
  {
    name: 'Limited Edition Banksy Print',
    description: 'Authenticated Banksy "Girl With Balloon" print. Limited edition 150/500. Comes with certificate of authenticity.',
    category: 'Art & Collectibles',
    startingPrice: 25000,
    currentPrice: 25000,
    minBidIncrement: 1000,
    images: [
      'https://images.unsplash.com/photo-1561214115-f2f134cc4912?w=800',
      'https://images.unsplash.com/photo-1578321272176-b7bbc0679853?w=800'
    ],
    condition: 'New',
    brand: 'Banksy',
    specifications: {
      'Edition': '150/500',
      'Size': '50cm x 70cm',
      'Medium': 'Screen Print',
      'Year': '2023',
      'Authentication': 'Pest Control COA'
    },
    location: 'Cape Town',
    shippingAvailable: true,
    shippingCost: 200,
    endDate: getFutureDate(10),
    sellerId: 'system',
    sellerName: 'QuickSell Store',
    status: 'active',
    featured: true,
    views: 0,
    watchers: [],
    bids: []
  },
  {
    name: 'Vintage Rolex Submariner',
    description: '1985 Rolex Submariner Date Ref. 16800. Excellent condition with box and papers. Serviced in 2023.',
    category: 'Art & Collectibles',
    startingPrice: 80000,
    currentPrice: 80000,
    minBidIncrement: 2000,
    images: [
      'https://images.unsplash.com/photo-1614164185128-e4ec99c436d7?w=800',
      'https://images.unsplash.com/photo-1622434641406-a158123450f9?w=800'
    ],
    condition: 'Used - Excellent',
    brand: 'Rolex',
    specifications: {
      'Model': 'Submariner Date',
      'Reference': '16800',
      'Year': '1985',
      'Movement': 'Automatic',
      'Case Size': '40mm'
    },
    location: 'Sandton',
    shippingAvailable: true,
    shippingCost: 500,
    endDate: getFutureDate(14),
    sellerId: 'system',
    sellerName: 'QuickSell Store',
    status: 'active',
    featured: true,
    views: 0,
    watchers: [],
    bids: []
  }
];

export async function addSampleProducts() {
  console.log('Starting to add products...\n');
  
  const productsCollection = collection(db, 'products');
  let successCount = 0;
  let errorCount = 0;
  
  for (const product of products) {
    try {
      // Add timestamps
      const productData = {
        ...product,
        createdAt: new Date(),
        updatedAt: new Date(),
        endDate: Timestamp.fromDate(product.endDate)
      };
      
      // Add to Firestore
      const docRef = await addDoc(productsCollection, productData);
      console.log(`✅ Added: ${product.name} (ID: ${docRef.id})`);
      successCount++;
      
    } catch (error: any) {
      console.error(`❌ Error adding ${product.name}:`, error.message);
      errorCount++;
    }
  }
  
  console.log(`\n✨ Finished! Added ${successCount} products successfully, ${errorCount} errors.`);
  return { successCount, errorCount };
}