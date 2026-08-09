const { admin, db, auth, storage } = require('../config/firebase');
const jwt = require('jsonwebtoken');

const authMiddleware = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      throw new Error('No token provided');
    }

    // First try to verify as JWT token (from our login)
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Get user from database using the userId from JWT
      const { userUtils } = require('../utils/firestore');
      const user = await userUtils.findById(decoded.userId);
      
      if (!user) {
        throw new Error('User not found');
      }
      
      req.user = {
        uid: user.id,
        ...user,
        displayName: user.displayName || user.username || user.email
      };
      req.token = token;
      return next();
    } catch (jwtError) {
      // If JWT verification fails, try Firebase ID token
      console.log('JWT verification failed, trying Firebase token');
    }

    // Verify Firebase ID token
    if (!auth) {
      throw new Error('Firebase Auth not initialized');
    }

    const decodedToken = await auth.verifyIdToken(token);

    // Get user from Firebase
    if (!db) {
      throw new Error('Firebase Database not initialized');
    }

    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    
    if (!userDoc.exists) {
      // If user doesn't exist in Firestore, get from Firebase Auth
      if (!auth) {
        throw new Error('Firebase Auth not initialized');
      }

      const firebaseUser = await auth.getUser(decodedToken.uid);

      // Check if admin email
      const isAdmin = firebaseUser.email === 'admin@verispinejointcenters.com' ||
                      decodedToken.admin === true;

      // Create user in Firestore
      const timestamp = admin ? admin.firestore.FieldValue.serverTimestamp() : new Date();
      const userData = {
        uid: firebaseUser.uid,
        email: firebaseUser.email || '',
        displayName: firebaseUser.displayName || '',
        username: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || '',
        firstName: firebaseUser.displayName?.split(' ')[0] || '',
        lastName: firebaseUser.displayName?.split(' ')[1] || '',
        role: isAdmin ? 'admin' : 'user',
        balance: 0,
        emailVerified: firebaseUser.emailVerified || false,
        createdAt: timestamp
      };

      if (db) {
        await db.collection('users').doc(firebaseUser.uid).set(userData);
        console.log('Created new user in Firestore:', firebaseUser.uid, 'with role:', userData.role);
      }
      req.user = userData;
    } else {
      const userData = userDoc.data();
      req.user = { 
        uid: userDoc.id, 
        ...userData,
        displayName: userData.displayName || userData.username || userData.email
      };
    }

    req.token = token;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error.message);
    res.status(401).json({ error: 'Please authenticate' });
  }
};

const adminMiddleware = async (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ error: 'Admin access required' });
  }
};

const sellerMiddleware = async (req, res, next) => {
  if (req.user && (req.user.role === 'seller' || req.user.role === 'admin')) {
    next();
  } else {
    res.status(403).json({ error: 'Seller access required' });
  }
};

const optionalAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (token) {
      // Verify Firebase ID token
      if (!auth) {
        console.log('Firebase Auth not initialized for optional auth');
        next();
        return;
      }

      const decodedToken = await auth.verifyIdToken(token);

      // Get user from Firebase
      if (!db) {
        console.log('Firebase Database not initialized for optional auth');
        next();
        return;
      }

      const userDoc = await db.collection('users').doc(decodedToken.uid).get();
      
      if (userDoc.exists) {
        const userData = userDoc.data();
        req.user = { 
          uid: userDoc.id, 
          ...userData,
          displayName: userData.displayName || userData.username || userData.email
        };
        req.token = token;
      }
    }
  } catch (error) {
    // Continue without authentication
  }
  
  next();
};

module.exports = {
  authMiddleware,
  adminMiddleware,
  sellerMiddleware,
  optionalAuth
};