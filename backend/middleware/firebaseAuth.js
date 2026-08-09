const { auth } = require('../config/firebase');

const firebaseAuthMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const idToken = authHeader.split('Bearer ')[1];
    
    if (!auth) {
      console.error('Firebase Auth not initialized');
      return res.status(500).json({ error: 'Authentication service unavailable' });
    }

    // Verify the ID token
    const decodedToken = await auth.verifyIdToken(idToken);
    
    // Add the decoded token to the request
    req.firebaseUser = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      emailVerified: decodedToken.email_verified,
      displayName: decodedToken.name,
      photoURL: decodedToken.picture,
      phoneNumber: decodedToken.phone_number,
      customClaims: decodedToken
    };

    // Fetch user from Firestore
    const { userUtils } = require('../utils/firestore');
    const user = await userUtils.findByEmail(decodedToken.email);
    
    if (user) {
      req.user = user;
    }

    next();
  } catch (error) {
    console.error('Firebase auth error:', error);
    
    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({ error: 'Token expired' });
    } else if (error.code === 'auth/id-token-revoked') {
      return res.status(401).json({ error: 'Token revoked' });
    } else if (error.code === 'auth/argument-error') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

// Optional middleware for routes that can work with or without authentication
const optionalFirebaseAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const idToken = authHeader.split('Bearer ')[1];
    
    if (!auth) {
      console.error('Firebase Auth not initialized');
      return next();
    }

    const decodedToken = await auth.verifyIdToken(idToken);
    
    req.firebaseUser = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      emailVerified: decodedToken.email_verified,
      displayName: decodedToken.name,
      photoURL: decodedToken.picture,
      phoneNumber: decodedToken.phone_number,
      customClaims: decodedToken
    };

    const { userUtils } = require('../utils/firestore');
    const user = await userUtils.findByEmail(decodedToken.email);
    
    if (user) {
      req.user = user;
    }
  } catch (error) {
    console.error('Optional auth error:', error);
  }
  
  next();
};

// Middleware to check if user has specific role
const requireRole = (roles) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
};

module.exports = {
  firebaseAuthMiddleware,
  optionalFirebaseAuth,
  requireRole
};