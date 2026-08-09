const { db } = require('../config/firebase');
const bcrypt = require('bcryptjs');

// Collection names
const COLLECTIONS = {
  USERS: 'users',
  PRODUCTS: 'products', 
  BIDS: 'bids',
  ORDERS: 'orders',
  CATEGORIES: 'categories',
  NOTIFICATIONS: 'notifications'
};

// User utilities
const userUtils = {
  async findById(id) {
    const doc = await db.collection(COLLECTIONS.USERS).doc(id).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
  },

  async findByEmail(email) {
    const snapshot = await db.collection(COLLECTIONS.USERS)
      .where('email', '==', email)
      .limit(1)
      .get();
    
    return snapshot.empty ? null : { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
  },

  async findByUsername(username) {
    const snapshot = await db.collection(COLLECTIONS.USERS)
      .where('username', '==', username)
      .limit(1)
      .get();
    
    return snapshot.empty ? null : { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
  },

  async findByEmailOrUsername(email, username) {
    // Check email first
    let user = await this.findByEmail(email);
    if (user) return user;

    // Check username
    return await this.findByUsername(username);
  },

  async findByVerificationToken(token) {
    const snapshot = await db.collection(COLLECTIONS.USERS)
      .where('verificationToken', '==', token)
      .limit(1)
      .get();

    return snapshot.empty ? null : { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
  },

  async findByResetToken(token) {
    const snapshot = await db.collection(COLLECTIONS.USERS)
      .where('resetToken', '==', token)
      .limit(1)
      .get();

    return snapshot.empty ? null : { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
  },

  async create(userData) {
    // Hash password if provided
    if (userData.password) {
      const salt = await bcrypt.genSalt(10);
      userData.password = await bcrypt.hash(userData.password, salt);
    }

    // Add timestamps
    userData.createdAt = new Date();
    userData.updatedAt = new Date();
    
    const docRef = await db.collection(COLLECTIONS.USERS).add(userData);
    return { id: docRef.id, ...userData };
  },

  async update(id, updateData) {
    updateData.updatedAt = new Date();
    await db.collection(COLLECTIONS.USERS).doc(id).update(updateData);
    return { id, ...updateData };
  },

  async comparePassword(password, hashedPassword) {
    return await bcrypt.compare(password, hashedPassword);
  },

  async hashPassword(password) {
    const salt = await bcrypt.genSalt(10);
    return await bcrypt.hash(password, salt);
  }
};

// Product utilities
const productUtils = {
  async findById(id) {
    const doc = await db.collection(COLLECTIONS.PRODUCTS).doc(id).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
  },

  async findAll(filters = {}, limit = 20, offset = 0) {
    let query = db.collection(COLLECTIONS.PRODUCTS);

    // Apply filters
    if (filters.status) {
      query = query.where('status', '==', filters.status);
    }
    if (filters.category) {
      query = query.where('category', '==', filters.category);
    }
    if (filters.seller) {
      query = query.where('seller', '==', filters.seller);
    }
    
    // Order by creation date (newest first) - indexes are now created
    query = query.orderBy('createdAt', 'desc');

    // Apply pagination
    query = query.offset(offset).limit(limit);

    const snapshot = await query.get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  async create(productData) {
    productData.createdAt = new Date();
    productData.updatedAt = new Date();
    
    const docRef = await db.collection(COLLECTIONS.PRODUCTS).add(productData);
    return { id: docRef.id, ...productData };
  },

  async update(id, updateData) {
    updateData.updatedAt = new Date();
    await db.collection(COLLECTIONS.PRODUCTS).doc(id).update(updateData);
    return { id, ...updateData };
  },

  async delete(id) {
    await db.collection(COLLECTIONS.PRODUCTS).doc(id).delete();
  }
};

// Bid utilities
const bidUtils = {
  async findById(id) {
    const doc = await db.collection(COLLECTIONS.BIDS).doc(id).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
  },

  async findByProduct(productId) {
    const snapshot = await db.collection(COLLECTIONS.BIDS)
      .where('productId', '==', productId)
      .orderBy('amount', 'desc')
      .get();
    
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  async findByUser(userId) {
    const snapshot = await db.collection(COLLECTIONS.BIDS)
      .where('bidder', '==', userId)
      .orderBy('placedAt', 'desc')
      .get();
    
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  async create(bidData) {
    bidData.placedAt = new Date();
    
    const docRef = await db.collection(COLLECTIONS.BIDS).add(bidData);
    return { id: docRef.id, ...bidData };
  },

  async update(id, updateData) {
    await db.collection(COLLECTIONS.BIDS).doc(id).update(updateData);
    return { id, ...updateData };
  }
};

// Order utilities  
const orderUtils = {
  async findById(id) {
    const doc = await db.collection(COLLECTIONS.ORDERS).doc(id).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
  },

  async findByUser(userId) {
    const snapshot = await db.collection(COLLECTIONS.ORDERS)
      .where('buyer', '==', userId)
      .orderBy('createdAt', 'desc')
      .get();
    
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  async create(orderData) {
    orderData.createdAt = new Date();
    orderData.updatedAt = new Date();
    
    const docRef = await db.collection(COLLECTIONS.ORDERS).add(orderData);
    return { id: docRef.id, ...orderData };
  },

  async update(id, updateData) {
    updateData.updatedAt = new Date();
    await db.collection(COLLECTIONS.ORDERS).doc(id).update(updateData);
    return { id, ...updateData };
  }
};

// Category utilities
const categoryUtils = {
  async findAll() {
    const snapshot = await db.collection(COLLECTIONS.CATEGORIES).get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  async findById(id) {
    const doc = await db.collection(COLLECTIONS.CATEGORIES).doc(id).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
  },

  async create(categoryData) {
    categoryData.createdAt = new Date();
    categoryData.updatedAt = new Date();
    
    const docRef = await db.collection(COLLECTIONS.CATEGORIES).add(categoryData);
    return { id: docRef.id, ...categoryData };
  },

  async update(id, updateData) {
    updateData.updatedAt = new Date();
    await db.collection(COLLECTIONS.CATEGORIES).doc(id).update(updateData);
    return { id, ...updateData };
  },

  async delete(id) {
    await db.collection(COLLECTIONS.CATEGORIES).doc(id).delete();
  }
};

// Notification utilities
const notificationUtils = {
  async findByUser(userId) {
    const snapshot = await db.collection(COLLECTIONS.NOTIFICATIONS)
      .where('recipient', '==', userId)
      .orderBy('createdAt', 'desc')
      .get();
    
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  async create(notificationData) {
    notificationData.createdAt = new Date();
    
    const docRef = await db.collection(COLLECTIONS.NOTIFICATIONS).add(notificationData);
    return { id: docRef.id, ...notificationData };
  },

  async markAsRead(id) {
    await db.collection(COLLECTIONS.NOTIFICATIONS).doc(id).update({
      isRead: true,
      readAt: new Date()
    });
  }
};

// Batch operations
const batchUtils = {
  createBatch() {
    return db.batch();
  },

  async commitBatch(batch) {
    return await batch.commit();
  }
};

module.exports = {
  COLLECTIONS,
  userUtils,
  productUtils,
  bidUtils,
  orderUtils,
  categoryUtils,
  notificationUtils,
  batchUtils,
  db
};
