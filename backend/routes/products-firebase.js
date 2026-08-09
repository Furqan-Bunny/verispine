const express = require('express');
const router = express.Router();
const { admin, db, storage } = require('../config/firebase');
const { authMiddleware, sellerMiddleware } = require('../middleware/auth');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

// Get bucket only if storage is available
const bucket = storage ? storage.bucket() : null;

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp/;
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Upload image to Firebase Storage
const uploadToStorage = (file) => {
  const fileName = `products/${uuidv4()}-${file.originalname}`;
  const fileUpload = bucket.file(fileName);

  return new Promise((resolve, reject) => {
    // Guard: settle exactly once (a stream could otherwise fire finish AND error, or neither).
    let settled = false;
    const finish = (fn, arg) => { if (!settled) { settled = true; fn(arg); } };

    // Simple (non-resumable) upload. The GCS default is a RESUMABLE upload, which does a session
    // handshake and fails intermittently on small image files — that was silently dropping pictures.
    const stream = fileUpload.createWriteStream({
      resumable: false,
      metadata: { contentType: file.mimetype },
    });

    // If the stream never fires finish/error, don't hang the whole request forever.
    const timer = setTimeout(() => {
      stream.destroy();
      finish(reject, new Error(`Image upload timed out: ${file.originalname}`));
    }, 30000);

    stream.on('error', (error) => {
      clearTimeout(timer);
      finish(reject, error);
    });

    stream.on('finish', async () => {
      clearTimeout(timer);
      const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
      // The file IS already stored at this point. makePublic() only sets the per-object ACL; if it
      // fails (e.g. the bucket uses uniform bucket-level access) we must NOT lose the image — keep
      // the URL and let bucket-level IAM govern access. Only a real upload error (above) drops it.
      try {
        await fileUpload.makePublic();
      } catch (aclErr) {
        console.warn(`makePublic failed for ${fileName} (keeping uploaded file):`, aclErr.message);
      }
      finish(resolve, publicUrl);
    });

    stream.end(file.buffer);
  });
};

// Upload one image with a few retries to ride out transient GCS/network blips.
const uploadImageWithRetry = async (file, attempts = 3) => {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await uploadToStorage(file);
    } catch (err) {
      lastErr = err;
      console.error(`Image upload attempt ${i + 1}/${attempts} failed for ${file.originalname}:`, err.message);
    }
  }
  throw lastErr || new Error('Image upload failed');
};

// Upload ALL images or throw. This is intentionally all-or-nothing: previously a single failed
// upload was swallowed and the product saved with silently-missing pictures. Now the caller fails
// the request instead, so a listing is never created/updated with dropped images.
const uploadAllImages = async (files) => {
  const urls = [];
  for (const file of files) {
    urls.push(await uploadImageWithRetry(file));
  }
  return urls;
};

// POST /bulk — bulk action on multiple products owned by current seller
// Body: { productIds: string[], action: 'end'|'delete'|'feature'|'unfeature', payload?: {} }
router.post('/bulk', authMiddleware, sellerMiddleware, async (req, res) => {
  try {
    const { productIds, action } = req.body || {};
    const validActions = ['end', 'delete', 'feature', 'unfeature'];
    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ error: 'productIds (non-empty array) is required' });
    }
    if (productIds.length > 200) {
      return res.status(400).json({ error: 'Maximum 200 products per bulk action' });
    }
    if (!validActions.includes(action)) {
      return res.status(400).json({ error: `action must be one of: ${validActions.join(', ')}` });
    }

    const isAdmin = req.user.role === 'admin';
    const results = { succeeded: [], failed: [] };

    for (const productId of productIds) {
      try {
        const docRef = db.collection('products').doc(productId);
        const docSnap = await docRef.get();
        if (!docSnap.exists) {
          results.failed.push({ productId, reason: 'not found' });
          continue;
        }
        const product = docSnap.data();
        if (!isAdmin && product.sellerId !== req.user.uid) {
          results.failed.push({ productId, reason: 'not owned by you' });
          continue;
        }

        if (action === 'delete') {
          // Delete product + its bids
          const bidsSnap = await db.collection('bids').where('productId', '==', productId).get();
          const batch = db.batch();
          bidsSnap.forEach(b => batch.delete(b.ref));
          batch.delete(docRef);
          await batch.commit();
          results.succeeded.push(productId);
        } else if (action === 'end') {
          if (product.status !== 'active' && product.status !== 'scheduled') {
            results.failed.push({ productId, reason: `cannot end (status: ${product.status})` });
            continue;
          }
          await docRef.update({
            status: 'ended',
            endedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          results.succeeded.push(productId);
        } else if (action === 'feature' || action === 'unfeature') {
          await docRef.update({
            featured: action === 'feature',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          results.succeeded.push(productId);
        }
      } catch (e) {
        results.failed.push({ productId, reason: e.message });
      }
    }

    res.json({
      success: true,
      message: `Bulk ${action} completed`,
      data: results
    });
  } catch (error) {
    console.error('Error processing bulk action:', error);
    res.status(500).json({ error: 'Failed to process bulk action' });
  }
});

// Get my products (for seller/admin). Sellers see only their own; admins see all.
router.get('/my-products', authMiddleware, sellerMiddleware, async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';

    let query = db.collection('products');
    if (!isAdmin) {
      query = query.where('sellerId', '==', req.user.uid);
    }

    let snapshot;
    try {
      snapshot = await query.orderBy('createdAt', 'desc').get();
    } catch (error) {
      // Fallback without ordering if index is missing
      console.log('Products orderBy failed, using fallback:', error.message);
      snapshot = await query.get();
    }

    const products = [];
    snapshot.forEach(doc => {
      products.push({
        id: doc.id,
        ...doc.data()
      });
    });

    res.json({
      success: true,
      data: products
    });
  } catch (error) {
    console.error('Error fetching my products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Get all products
router.get('/', async (req, res) => {
  try {
    const { category, status, search, sort, listingType } = req.query;
    console.log('Getting products with params:', { category, status, search, sort, listingType });

    let query = db.collection('products');

    // Apply filters
    if (category) {
      query = query.where('categoryId', '==', category);
    }

    // Filter by status - default to active + scheduled products
    if (status === 'all') {
      // No filter, show everything (for admin use)
    } else if (status === 'upcoming') {
      query = query.where('status', '==', 'scheduled');
    } else if (status) {
      query = query.where('status', '==', status);
    } else {
      // Show both active and scheduled (upcoming) products by default
      query = query.where('status', 'in', ['active', 'scheduled']);
    }

    // Get all products
    const snapshot = await query.get();
    console.log('Found products in Firestore:', snapshot.size);
    let products = [];
    
    snapshot.forEach(doc => {
      const product = {
        id: doc.id,
        ...doc.data()
      };
      
      // Filter by listing type if requested. Legacy products without the field
      // are treated as auctions. Done in-memory to avoid a new composite index.
      if (listingType === 'auction' || listingType === 'sale') {
        const productType = product.listingType || 'auction';
        if (productType !== listingType) {
          return;
        }
      }

      // Apply search filter if needed
      if (!search ||
          product.title?.toLowerCase().includes(search.toLowerCase()) ||
          product.description?.toLowerCase().includes(search.toLowerCase())) {
        products.push(product);
      }
    });
    
    // Apply sorting
    if (sort === 'price-asc') {
      products.sort((a, b) => Number(a.currentPrice || 0) - Number(b.currentPrice || 0));
    } else if (sort === 'price-desc') {
      products.sort((a, b) => Number(b.currentPrice || 0) - Number(a.currentPrice || 0));
    } else if (sort === 'ending-soon') {
      products.sort((a, b) => {
        const aDate = a.endDate?._seconds ? a.endDate._seconds : new Date(a.endDate).getTime() / 1000;
        const bDate = b.endDate?._seconds ? b.endDate._seconds : new Date(b.endDate).getTime() / 1000;
        return aDate - bDate;
      });
    } else {
      // Default: newest first
      products.sort((a, b) => {
        const aDate = a.createdAt?._seconds || 0;
        const bDate = b.createdAt?._seconds || 0;
        return bDate - aDate;
      });
    }
    
    res.json({
      success: true,
      data: products
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Test endpoint to check Firestore connection
router.get('/test-firestore', async (req, res) => {
  try {
    // Try to get products collection
    const snapshot = await db.collection('products').limit(5).get();
    const products = [];

    snapshot.forEach(doc => {
      products.push({
        id: doc.id,
        ...doc.data()
      });
    });

    // Also check what collections exist
    const collections = await db.listCollections();
    const collectionNames = collections.map(col => col.id);

    res.json({
      success: true,
      message: 'Firestore connected',
      productsFound: snapshot.size,
      sampleProducts: products,
      collections: collectionNames,
      projectId: process.env.FIREBASE_PROJECT_ID || 'quicksell-80aad'
    });
  } catch (error) {
    console.error('Firestore test error:', error);
    res.status(500).json({
      error: error.message,
      stack: error.stack
    });
  }
});

// Get single product
router.get('/:id', async (req, res) => {
  try {
    const productId = req.params.id;
    
    // Validate product ID format
    if (!productId || productId === 'undefined' || productId === 'null') {
      return res.status(400).json({ error: 'Invalid product ID' });
    }
    
    // Try to fetch the product
    let doc;
    try {
      doc = await db.collection('products').doc(productId).get();
    } catch (firestoreError) {
      console.error('Firestore error:', firestoreError);
      // If Firestore throws an error (invalid ID format), return 400
      if (firestoreError.code === 'invalid-argument') {
        return res.status(400).json({ error: 'Invalid product ID format' });
      }
      throw firestoreError;
    }
    
    if (!doc.exists) {
      console.log('Product not found:', productId);
      return res.status(404).json({ error: 'Product not found' });
    }
    
    const productData = doc.data();

    // Debug: log shipping data
    console.log('Product shipping data:', {
      id: productId,
      title: productData.title,
      shipping: productData.shipping,
      shippingCost: productData.shippingCost,
      freeShipping: productData.freeShipping
    });

    // Only increment view count if product is active
    if (productData.status === 'active') {
      try {
        await db.collection('products').doc(productId).update({
          views: admin.firestore.FieldValue.increment(1)
        });
      } catch (updateError) {
        // Don't fail the request if view count update fails
        console.error('Failed to update view count:', updateError);
      }
    }
    
    // Get related data (bids) if needed
    let bids = [];
    try {
      const bidsSnapshot = await db.collection('bids')
        .where('productId', '==', productId)
        .orderBy('amount', 'desc')
        .limit(10)
        .get();
      
      bids = bidsSnapshot.docs.map(bidDoc => ({
        id: bidDoc.id,
        ...bidDoc.data()
      }));
    } catch (bidsError) {
      console.log('Could not fetch bids:', bidsError);
      // Continue without bids
    }
    
    res.json({
      success: true,
      data: {
        id: doc.id,
        ...productData
      },
      bids
    });
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ 
      error: 'Failed to fetch product',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Create product (Seller or Admin)
router.post('/', authMiddleware, upload.array('images', 5), async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'seller') {
      return res.status(403).json({ error: 'Only sellers and admins can create products' });
    }
    
    const {
      title,
      description,
      category,
      categoryId,
      startingPrice,
      incrementAmount,
      buyNowPrice,
      condition,
      endDate,
      specifications,
      shipping,
      isLiveAuction,
      registrationFee,
      scheduledStartTime,
      duration,
      weight,
      listingType,
      price,
      quantity,
      stockType,
      dimensions
    } = req.body;

    // Optional parcel dimensions (cm) for courier rating (ShipLogic). Accept a JSON
    // string or object; store only if all three are valid positive numbers (<=200cm).
    const parseDimensions = (raw) => {
      if (!raw) return null;
      let d = raw;
      if (typeof raw === 'string') { try { d = JSON.parse(raw); } catch { return null; } }
      const l = Number(d.length), w = Number(d.width), h = Number(d.height);
      const ok = [l, w, h].every(v => isFinite(v) && v > 0 && v <= 200);
      return ok ? { length: l, width: w, height: h } : null;
    };
    const parcelDimensions = parseDimensions(dimensions);

    // Listing type: 'auction' (default, current behaviour) or 'sale' (fixed-price,
    // multi-quantity stock, no bidding/end date). Anything unrecognised falls back to auction.
    const normalizedListingType = listingType === 'sale' ? 'sale' : 'auction';
    const isSale = normalizedListingType === 'sale';

    // Fixed-price products are validated differently: they need a price and stock,
    // but no starting price / increment / duration.
    //
    // Stock can be one of two modes:
    //  - 'limited'   : a fixed quantity that auto-goes-out-of-stock at 0 (default).
    //  - 'unlimited' : "always available" — no quantity; stays live until a seller/
    //                  admin marks it out of stock. soldQuantity still counts sales.
    let salePrice = null;
    let saleQuantity = null;
    const saleStockType = isSale ? (stockType === 'unlimited' ? 'unlimited' : 'limited') : null;
    if (isSale) {
      salePrice = parseFloat(price);
      if (!salePrice || salePrice <= 0) {
        return res.status(400).json({ error: 'Price must be greater than 0', field: 'price' });
      }
      if (saleStockType === 'limited') {
        saleQuantity = parseInt(quantity, 10);
        if (!Number.isInteger(saleQuantity) || saleQuantity < 1) {
          return res.status(400).json({ error: 'Quantity must be a whole number of at least 1', field: 'quantity' });
        }
      }
    }

    // Validate weight upfront — required by SAPO. Without this, every shipment
    // defaults to 1kg silently and SAPO underbills heavy items.
    const { validateProductWeight, validatePickupAddress } = require('../utils/addressValidation');
    const weightCheck = validateProductWeight(weight);
    if (!weightCheck.valid) {
      return res.status(400).json({ error: weightCheck.error, field: 'weight' });
    }

    // Validate pickup address (already validated client-side in CreateAuction,
    // but defense in depth: SAPO Sender block requires these fields).
    const shippingDataPreview = shipping ? JSON.parse(shipping) : null;
    if (shippingDataPreview && (shippingDataPreview.pickupAddress || shippingDataPreview.pickupCity || shippingDataPreview.pickupPostalCode)) {
      const pickupCheck = validatePickupAddress({
        address: shippingDataPreview.pickupAddress,
        city: shippingDataPreview.pickupCity,
        suburb: shippingDataPreview.pickupSuburb,
        postalCode: shippingDataPreview.pickupPostalCode
      });
      if (!pickupCheck.valid) {
        return res.status(400).json({
          error: 'Invalid pickup address',
          fieldErrors: pickupCheck.errors
        });
      }
    }

    // Upload images if provided. All-or-nothing: if any image can't be stored (after retries),
    // fail the request instead of silently creating a product with missing pictures.
    let imageUrls = [];
    if (req.files && req.files.length > 0) {
      try {
        imageUrls = await uploadAllImages(req.files);
      } catch (uploadErr) {
        console.error('Product create: image upload failed:', uploadErr.message);
        return res.status(502).json({ error: 'One or more images failed to upload. Please try again.' });
      }
    }
    
    // Parse shipping data once
    const shippingData = shipping ? JSON.parse(shipping) : {
      cost: 0,
      location: 'South Africa',
      methods: ['Standard Shipping']
    };

    console.log('Creating product with shipping:', shippingData);

    // Determine if this is a scheduled auction. Fixed-price products are never
    // scheduled and never auto-expire (no endDate), so they skip this entirely.
    const isScheduled = !isSale && scheduledStartTime && new Date(scheduledStartTime) > new Date();
    let productStatus = 'active';
    const durationDays = isSale ? null : (parseInt(duration) || 7);
    let calculatedEndDate = isSale ? null : new Date(endDate);

    if (isScheduled) {
      productStatus = 'scheduled';
      calculatedEndDate = new Date(new Date(scheduledStartTime).getTime() + durationDays * 24 * 60 * 60 * 1000);
    }

    // Create product document. Auction-only fields (startingPrice/increment/buyNow/
    // endDate/scheduling/live-auction) are inert for sale products; price/quantity/
    // soldQuantity drive the fixed-price flow. currentPrice/startingPrice mirror price
    // so existing display code (ProductCard, lists) renders the right number unchanged.
    const product = {
      title,
      description,
      category,
      categoryId,
      images: imageUrls,
      listingType: normalizedListingType,
      startingPrice: isSale ? salePrice : parseFloat(startingPrice),
      currentPrice: isSale ? salePrice : parseFloat(startingPrice),
      incrementAmount: isSale ? 0 : (parseFloat(incrementAmount) || 100),
      buyNowPrice: isSale ? null : (buyNowPrice ? parseFloat(buyNowPrice) : null),
      // Fixed-price fields (null for auctions)
      price: isSale ? salePrice : null,
      stockType: saleStockType, // 'limited' | 'unlimited' (null for auctions)
      quantity: isSale ? saleQuantity : null, // null when unlimited ("always available")
      soldQuantity: isSale ? 0 : null,
      condition,
      status: productStatus,
      scheduledStartTime: isScheduled ? new Date(scheduledStartTime) : null,
      isScheduled: !!isScheduled,
      durationDays: durationDays,
      sellerId: req.user.uid,
      sellerName: req.user.username || req.user.email,
      endDate: calculatedEndDate,
      specifications: specifications ? JSON.parse(specifications) : {},
      shipping: shippingData,
      // Store at top level for easy access
      shippingCost: shippingData.cost || 0,
      freeShipping: shippingData.cost === 0,
      // Product weight in lbs — see utils/addressValidation
      weight: weightCheck.weight,
      // Optional parcel dimensions (cm) for courier rating (ShipLogic); null = use defaults
      dimensions: parcelDimensions,
      // "City, Province" string for backward compat display (ProductCard/ProductDetail)
      location: shippingData.pickupCity && shippingData.pickupProvince
        ? `${shippingData.pickupCity}, ${shippingData.pickupProvince}`
        : (shippingData.location || 'South Africa'),
      views: 0,
      bidsCount: 0,
      watchers: 0,
      featured: false,
      // Live auction fields
      isLiveAuction: isLiveAuction === 'true' || isLiveAuction === true,
      registrationFee: isLiveAuction ? (parseFloat(registrationFee) || 5) : 0,
      registeredUsers: [], // Array of user IDs who paid the registration fee
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    const docRef = await db.collection('products').add(product);

    // Update category product count
    if (categoryId) {
      await db.collection('categories').doc(categoryId).update({
        productCount: admin.firestore.FieldValue.increment(1)
      });
    }

    // If scheduled, immediately notify all users about the upcoming auction
    if (isScheduled) {
      const auctionScheduler = require('../services/auctionScheduler');
      // Pass a clean product object without Firestore sentinel values (createdAt/updatedAt)
      const cleanProduct = {
        title,
        description,
        category,
        categoryId,
        images: imageUrls,
        startingPrice: parseFloat(startingPrice),
        currentPrice: parseFloat(startingPrice),
        buyNowPrice: buyNowPrice ? parseFloat(buyNowPrice) : null,
        scheduledStartTime: new Date(scheduledStartTime),
        durationDays,
        status: productStatus,
        sellerId: req.user.uid,
        sellerName: req.user.username || req.user.email
      };
      auctionScheduler.broadcastAuctionScheduled(docRef.id, cleanProduct).catch(err => {
        console.error('Error broadcasting scheduled auction:', err);
      });
    }

    res.json({
      success: true,
      data: {
        id: docRef.id,
        ...product
      }
    });
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// Update product (Admin or owning Seller)
router.put('/:id', authMiddleware, upload.array('images', 5), async (req, res) => {
  try {
    const productId = req.params.id;

    const ownershipDoc = await db.collection('products').doc(productId).get();
    if (!ownershipDoc.exists) {
      return res.status(404).json({ error: 'Product not found' });
    }
    if (req.user.role !== 'admin' && ownershipDoc.data().sellerId !== req.user.uid) {
      return res.status(403).json({ error: 'You can only update your own products' });
    }

    const updates = { ...req.body };

    // If weight is being updated, validate against SAPO bounds
    if (updates.weight !== undefined && updates.weight !== '') {
      const { validateProductWeight } = require('../utils/addressValidation');
      const weightCheck = validateProductWeight(updates.weight);
      if (!weightCheck.valid) {
        return res.status(400).json({ error: weightCheck.error, field: 'weight' });
      }
      updates.weight = weightCheck.weight;
    }

    // Handle image uploads. All-or-nothing (same as create): fail loudly rather than silently
    // dropping a picture and appending a partial set.
    if (req.files && req.files.length > 0) {
      let imageUrls;
      try {
        imageUrls = await uploadAllImages(req.files);
      } catch (uploadErr) {
        console.error('Product update: image upload failed:', uploadErr.message);
        return res.status(502).json({ error: 'One or more images failed to upload. Please try again.' });
      }

      // Add new images to existing ones
      const doc = await db.collection('products').doc(productId).get();
      const existingImages = doc.data()?.images || [];
      updates.images = [...existingImages, ...imageUrls];
    }
    
    // Handle rescheduling for scheduled auctions
    if (updates.scheduledStartTime) {
      const doc = await db.collection('products').doc(productId).get();
      const existing = doc.data();
      if (existing.status === 'scheduled') {
        const newStartTime = new Date(updates.scheduledStartTime);
        const durationDays = parseInt(updates.duration || existing.durationDays) || 7;
        updates.scheduledStartTime = newStartTime;
        updates.endDate = new Date(newStartTime.getTime() + durationDays * 24 * 60 * 60 * 1000);
        updates.durationDays = durationDays;
      } else {
        // Can't reschedule a non-scheduled auction
        delete updates.scheduledStartTime;
      }
    }

    // Parse JSON fields if they're strings
    if (typeof updates.specifications === 'string') {
      updates.specifications = JSON.parse(updates.specifications);
    }
    if (typeof updates.shipping === 'string') {
      updates.shipping = JSON.parse(updates.shipping);
    }
    // Parcel dimensions: parse + validate; drop the field if invalid so we don't store junk.
    if (updates.dimensions !== undefined) {
      let d = updates.dimensions;
      if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = null; } }
      const l = Number(d && d.length), w = Number(d && d.width), h = Number(d && d.height);
      if ([l, w, h].every(v => isFinite(v) && v > 0 && v <= 200)) {
        updates.dimensions = { length: l, width: w, height: h };
      } else {
        delete updates.dimensions;
      }
    }
    
    // listingType is immutable after creation — never let an edit flip a product
    // between auction and sale (would orphan bids / stock). Ignore any incoming value.
    delete updates.listingType;
    // stockType (limited vs unlimited) is likewise fixed at creation. The in/out-of-stock
    // state is controlled via `status` ('active' <-> 'sold'), not by switching stockType.
    delete updates.stockType;

    // Fixed-price edits: price + quantity. Keep currentPrice/startingPrice mirrored to
    // price, and never let stock drop below what's already been sold.
    const existingForSale = ownershipDoc.data();
    if (existingForSale.listingType === 'sale') {
      if (updates.price !== undefined && updates.price !== '') {
        const newPrice = parseFloat(updates.price);
        if (!newPrice || newPrice <= 0) {
          return res.status(400).json({ error: 'Price must be greater than 0', field: 'price' });
        }
        updates.price = newPrice;
        updates.currentPrice = newPrice;
        updates.startingPrice = newPrice;
      }
      // Quantity only applies to limited stock. Unlimited ("always available") has no
      // quantity, so any incoming quantity is ignored.
      if (existingForSale.stockType === 'unlimited') {
        delete updates.quantity;
      } else if (updates.quantity !== undefined && updates.quantity !== '') {
        const newQty = parseInt(updates.quantity, 10);
        const alreadySold = existingForSale.soldQuantity || 0;
        if (!Number.isInteger(newQty) || newQty < 1) {
          return res.status(400).json({ error: 'Quantity must be a whole number of at least 1', field: 'quantity' });
        }
        if (newQty < alreadySold) {
          return res.status(400).json({ error: `Quantity cannot be below units already sold (${alreadySold})`, field: 'quantity' });
        }
        updates.quantity = newQty;
        // Re-open a sold-out product if stock was increased
        if (existingForSale.status === 'sold' && newQty > alreadySold) {
          updates.status = 'active';
        }
      }
    }

    // Convert price fields to numbers
    if (updates.startingPrice) updates.startingPrice = parseFloat(updates.startingPrice);
    if (updates.currentPrice) updates.currentPrice = parseFloat(updates.currentPrice);
    if (updates.incrementAmount) updates.incrementAmount = parseFloat(updates.incrementAmount);
    if (updates.buyNowPrice) updates.buyNowPrice = parseFloat(updates.buyNowPrice);

    // If startingPrice changed and no bids exist, sync currentPrice
    if (updates.startingPrice) {
      const doc = await db.collection('products').doc(productId).get();
      const existing = doc.data();
      if (existing.bidsCount === 0 || existing.currentPrice === existing.startingPrice) {
        updates.currentPrice = updates.startingPrice;
      }
    }

    // Update top-level location from structured shipping fields
    if (updates.shipping && updates.shipping.pickupCity && updates.shipping.pickupProvince) {
      updates.location = `${updates.shipping.pickupCity}, ${updates.shipping.pickupProvince}`;
    }

    // Update timestamp
    updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    
    await db.collection('products').doc(productId).update(updates);
    
    res.json({
      success: true,
      message: 'Product updated successfully'
    });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// Delete product (Admin or owning Seller)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const productId = req.params.id;

    // Get product to check ownership + category
    const doc = await db.collection('products').doc(productId).get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const product = doc.data();
    if (req.user.role !== 'admin' && product.sellerId !== req.user.uid) {
      return res.status(403).json({ error: 'You can only delete your own products' });
    }
    
    // Delete product
    await db.collection('products').doc(productId).delete();
    
    // Update category product count
    if (product.categoryId) {
      await db.collection('categories').doc(product.categoryId).update({
        productCount: admin.firestore.FieldValue.increment(-1)
      });
    }
    
    // Delete associated bids
    const bidsSnapshot = await db.collection('bids')
      .where('productId', '==', productId)
      .get();
    
    const batch = db.batch();
    bidsSnapshot.forEach(doc => {
      batch.delete(doc.ref);
    });
    await batch.commit();
    
    res.json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// End auction manually (Admin or owning Seller)
router.post('/:id/end', authMiddleware, async (req, res) => {
  try {
    const productId = req.params.id;

    const ownershipDoc = await db.collection('products').doc(productId).get();
    if (!ownershipDoc.exists) {
      return res.status(404).json({ error: 'Product not found' });
    }
    if (req.user.role !== 'admin' && ownershipDoc.data().sellerId !== req.user.uid) {
      return res.status(403).json({ error: 'You can only end your own auctions' });
    }

    const auctionScheduler = require('../services/auctionScheduler');
    
    const result = await auctionScheduler.endAuctionManually(productId);
    
    // Emit socket event
    const socketService = req.app.get('socketService');
    if (socketService) {
      socketService.emitToAuction(productId, 'auction-ended', {
        message: 'Auction has ended'
      });
    }
    
    res.json({
      success: true,
      message: result.message
    });
  } catch (error) {
    console.error('Error ending auction:', error);
    res.status(500).json({ error: error.message || 'Failed to end auction' });
  }
});

// Toggle featured status (Admin or owning Seller)
router.post('/:id/feature', authMiddleware, async (req, res) => {
  try {
    const productId = req.params.id;

    const ownershipDoc = await db.collection('products').doc(productId).get();
    if (!ownershipDoc.exists) {
      return res.status(404).json({ error: 'Product not found' });
    }
    if (req.user.role !== 'admin' && ownershipDoc.data().sellerId !== req.user.uid) {
      return res.status(403).json({ error: 'You can only feature your own products' });
    }

    const { featured } = req.body;
    
    await db.collection('products').doc(productId).update({
      featured: featured,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    res.json({
      success: true,
      message: `Product ${featured ? 'featured' : 'unfeatured'} successfully`
    });
  } catch (error) {
    console.error('Error updating featured status:', error);
    res.status(500).json({ error: 'Failed to update featured status' });
  }
});


// Delete ALL products (Admin only - DANGEROUS)
router.delete('/all/delete-all-products', authMiddleware, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admin can delete all products' });
    }

    // Get confirmation from request body
    const { confirmation } = req.body;
    if (confirmation !== 'DELETE_ALL_PRODUCTS') {
      return res.status(400).json({
        error: 'Invalid confirmation. Send { confirmation: "DELETE_ALL_PRODUCTS" }'
      });
    }

    // Get all products
    const productsSnapshot = await db.collection('products').get();

    if (productsSnapshot.empty) {
      return res.json({
        success: true,
        message: 'No products to delete',
        deletedCount: 0
      });
    }

    const totalProducts = productsSnapshot.size;
    const categoryUpdates = {};

    // Collect category IDs for updating counts
    productsSnapshot.forEach(doc => {
      const product = doc.data();
      if (product.categoryId) {
        categoryUpdates[product.categoryId] = (categoryUpdates[product.categoryId] || 0) + 1;
      }
    });

    // Delete products in batches (Firestore batch limit is 500)
    const batchSize = 500;
    const productDocs = productsSnapshot.docs;

    for (let i = 0; i < productDocs.length; i += batchSize) {
      const batch = db.batch();
      const chunk = productDocs.slice(i, i + batchSize);

      chunk.forEach(doc => {
        batch.delete(doc.ref);
      });

      await batch.commit();
    }

    // Delete all associated bids
    const bidsSnapshot = await db.collection('bids').get();
    if (!bidsSnapshot.empty) {
      const bidDocs = bidsSnapshot.docs;
      for (let i = 0; i < bidDocs.length; i += batchSize) {
        const batch = db.batch();
        const chunk = bidDocs.slice(i, i + batchSize);

        chunk.forEach(doc => {
          batch.delete(doc.ref);
        });

        await batch.commit();
      }
    }

    // Update category product counts
    for (const [categoryId, count] of Object.entries(categoryUpdates)) {
      try {
        await db.collection('categories').doc(categoryId).update({
          productCount: admin.firestore.FieldValue.increment(-count)
        });
      } catch (error) {
        console.error(`Failed to update category ${categoryId}:`, error);
      }
    }

    res.json({
      success: true,
      message: 'Successfully deleted all products',
      deletedCount: totalProducts,
      deletedBids: bidsSnapshot.size
    });
  } catch (error) {
    console.error('Error deleting all products:', error);
    res.status(500).json({ error: 'Failed to delete all products' });
  }
});

module.exports = router;
