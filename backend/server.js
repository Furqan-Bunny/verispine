// Catch any uncaught errors during startup
process.on('uncaughtException', (error) => {
  console.error('UNCAUGHT EXCEPTION:', error.message);
  console.error(error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION at:', promise);
  console.error('Reason:', reason);
});

console.log('=== Server Starting ===');
console.log('Node version:', process.version);
console.log('Current directory:', process.cwd());
console.log('PORT env:', process.env.PORT);
console.log('NODE_ENV:', process.env.NODE_ENV);

// Load backend/.env before anything reads process.env. Path-anchored, so it
// works regardless of the directory the process was started from.
require('./config/env');

const express = require('express');
const cors = require('cors');
const http = require('http');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');

console.log('Core modules loaded');

let db = null;
try {
  const firebase = require('./config/firebase');
  db = firebase.db;
  console.log('Firebase loaded, db available:', !!db);
} catch (error) {
  console.error('Firebase load error:', error.message);
}

console.log('env loaded');

const app = express();
const server = http.createServer(app);

// Trust proxy - required for Render and other cloud services
// Set to the number of proxies between the server and the client
app.set('trust proxy', 1);

// Rate limiting - disable validation to prevent startup crash
const isProd = process.env.NODE_ENV === 'production';
// Stable identity for rate-limit bucketing. Prefer the AUTHENTICATED USER so that a shared public
// IP, mobile-carrier NAT, or the Vercel->Railway proxy can't make unrelated users share one bucket
// — that shared-bucket effect is the main reason users hit the limit "for no reason". Falls back to
// the client IP for anonymous traffic. The bearer token is only DECODED (not verified) here, which
// is fine for choosing a bucket.
function rateLimitKey(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const parts = authHeader.slice(7).split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
        const uid = payload.user_id || payload.uid || payload.userId || payload.id || payload.sub;
        if (uid) return `u:${uid}`;
      }
    } catch (_) { /* malformed token — fall through to IP */ }
  }
  const forwarded = req.headers['x-forwarded-for'];
  const ip = forwarded ? forwarded.split(',')[0].trim()
    : (req.ip || req.socket?.remoteAddress || 'unknown');
  return `ip:${ip}`;
}

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  // Generous PER-IDENTITY budget (per logged-in user, not per shared IP — see rateLimitKey).
  // A normal session stays well under this; it's an abuse backstop, not a usage cap.
  max: isProd ? 1000 : 100000,
  // Don't count failed responses (cold-start 401s, 404s, or 429 retries). Otherwise a burst of
  // failures keeps the fixed window pinned at the limit and the app feels permanently throttled.
  skipFailedRequests: true,
  skip: (req) => {
    if (!isProd) return true; // bypass entirely outside production
    // Exempt cheap, high-frequency reads so a busy SPA / keepalive can't exhaust the budget.
    if (req.method === 'GET' && (req.originalUrl.startsWith('/api/health') || req.originalUrl.startsWith('/api/categories'))) return true;
    return false;
  },
  keyGenerator: rateLimitKey,
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  validate: false, // Disable validation to prevent trust proxy error
  handler: (req, res) => {
    const resetMs = req.rateLimit.resetTime instanceof Date
      ? req.rateLimit.resetTime.getTime()
      : Number(req.rateLimit.resetTime);
    const retryAfterSec = Math.max(1, Math.ceil((resetMs - Date.now()) / 1000));
    res.status(429).json({
      error: 'Too many requests, please try again later.',
      retryAfter: retryAfterSec
    });
  }
});

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: [
        "'self'",
        "https://*.googleapis.com",
        "https://*.google.com",
        "https://*.firebaseio.com",
        "https://*.firebaseapp.com",
        "https://*.firebase.app",
        "wss://*.firebaseio.com",
        // Stripe.js posts telemetry and tokenization requests to these hosts;
        // without them Stripe Checkout fails to initialise.
        "https://api.stripe.com",
        "https://maps.googleapis.com"
      ],
      imgSrc: [
        "'self'",
        "data:",
        "blob:",
        "https://*.googleapis.com",
        "https://*.googleusercontent.com",
        "https://storage.googleapis.com",
        "https://*.firebasestorage.app",
        "https://ui-avatars.com",
        "https://via.placeholder.com"
      ],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://js.stripe.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      // Stripe renders card fields and 3D Secure challenges inside iframes on these
      // hosts — omit them and the payment step is a blank box.
      frameSrc: ["'self'", "https://*.firebaseapp.com", "https://js.stripe.com", "https://hooks.stripe.com"]
    }
  },
  crossOriginEmbedderPolicy: false
}));
app.use(compression());

// CORS allowlist — shared with Socket.IO via config/corsOrigins.js so the two
// can never drift apart (see that file for why that matters).
const { buildAllowedOrigins, isAllowedOrigin } = require('./config/corsOrigins');
const allowedOrigins = buildAllowedOrigins();
console.log('CORS allowlist:', allowedOrigins.join(', ') || '(none configured)');

// CORS middleware - restrict to allowed origins
app.use(cors({
  origin: function(origin, callback) {
    // No Origin header = same-origin or a non-browser client (curl, the mobile
    // app, health checks). CORS is not the control for those.
    if (!origin) return callback(null, true);
    if (isAllowedOrigin(origin)) return callback(null, true);

    console.warn('CORS rejected origin:', origin);
    // Resolve without the CORS headers rather than throwing. Throwing here lands
    // in the error handler as a 500, which reads as "the server is broken" in
    // logs and monitoring when the request was simply not allowed. The browser
    // blocks the response either way — the absent header is what enforces it.
    const denied = new Error('Not allowed by CORS');
    denied.status = 403;
    return callback(denied);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400,
  optionsSuccessStatus: 200
}));

// Stripe webhook signature verification needs the UNPARSED body, so this raw
// mount must stay ahead of express.json(). If it is moved below, every webhook
// will fail verification and no payment will ever settle.
app.use('/api/payments/stripe/webhook', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
// Stricter rate limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // limit each IP to 20 auth requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  keyGenerator: (req) => {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
    return req.connection.remoteAddress || req.socket.remoteAddress || req.ip || 'unknown';
  },
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many authentication attempts, please try again later.',
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
    });
  }
});
app.use('/api/auth', authLimiter);
app.use('/api/', limiter);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Firebase is initialized in config/firebase.js
if (!db) {
  console.warn('WARNING: Firebase Firestore database not available');
  console.warn('Server will run with limited functionality');
  // Don't exit - let the server run anyway
}

// Import routes with error handling
console.log('Loading routes...');
let authRoutes, userRoutes, productRoutes, affiliateRoutes, bidRoutes;
let orderRoutes, categoryRoutes, walletRoutes, stripeRoutes;
let paymentVerificationRoutes, adminRoutes, withdrawalRoutes, reviewRoutes, auctionRegistrationRoutes, kycRoutes, notificationRoutes, questionRoutes, sellerApplicationRoutes, sellerRoutes, publicSellersRoutes, adminSellersRoutes, adminAffiliatesRoutes;

try {
  authRoutes = require('./routes/auth');
  console.log('✓ auth routes loaded');
  userRoutes = require('./routes/users-firebase');
  console.log('✓ users routes loaded');
  productRoutes = require('./routes/products-firebase');
  console.log('✓ products routes loaded');
  affiliateRoutes = require('./routes/affiliate');
  console.log('✓ affiliate routes loaded');
  bidRoutes = require('./routes/bids-firebase');
  console.log('✓ bids routes loaded');
  orderRoutes = require('./routes/orders-firebase');
  console.log('✓ orders routes loaded');
  categoryRoutes = require('./routes/categories-firebase');
  console.log('✓ categories routes loaded');
  walletRoutes = require('./routes/payments-wallet');
  console.log('✓ wallet routes loaded');
  stripeRoutes = require('./routes/payments-stripe');
  console.log('✓ stripe routes loaded');
  paymentVerificationRoutes = require('./routes/payments-verification');
  console.log('✓ payment verification routes loaded');
  adminRoutes = require('./routes/admin-firebase');
  console.log('✓ admin routes loaded');
  withdrawalRoutes = require('./routes/withdrawals-firebase');
  console.log('✓ withdrawal routes loaded');
  reviewRoutes = require('./routes/reviews');
  console.log('✓ reviews routes loaded');
  auctionRegistrationRoutes = require('./routes/auction-registration');
  console.log('✓ auction registration routes loaded');
  kycRoutes = require('./routes/kyc');
  console.log('✓ kyc routes loaded');
  notificationRoutes = require('./routes/notifications');
  console.log('✓ notification routes loaded');
  questionRoutes = require('./routes/questions');
  console.log('✓ question routes loaded');
  sellerApplicationRoutes = require('./routes/seller-application');
  console.log('✓ seller-application routes loaded');
  sellerRoutes = require('./routes/seller');
  console.log('✓ seller routes loaded');
  publicSellersRoutes = require('./routes/sellers');
  console.log('✓ public sellers routes loaded');
  adminSellersRoutes = require('./routes/admin-sellers');
  console.log('✓ admin-sellers routes loaded');
  adminAffiliatesRoutes = require('./routes/admin-affiliates');
  console.log('✓ admin-affiliates routes loaded');
  console.log('All routes loaded successfully!');
} catch (error) {
  console.error('ROUTE LOADING ERROR:', error.message);
  console.error(error.stack);
}

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/affiliate', affiliateRoutes);
app.use('/api/bids', bidRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/payments/wallet', walletRoutes);
app.use('/api/payments/stripe', stripeRoutes);
app.use('/api/payments/verification', paymentVerificationRoutes);
app.use('/api/withdrawals', withdrawalRoutes);
app.use('/api/admin/sellers', adminSellersRoutes);
app.use('/api/admin/affiliates', adminAffiliatesRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin-ext', require('./routes/admin-extended'));
app.use('/api/shipping', require('./routes/shipping'));
app.use('/api/reviews', reviewRoutes);
app.use('/api/auction-registration', auctionRegistrationRoutes);
app.use('/api/kyc', kycRoutes);
app.use('/api/seller-application', sellerApplicationRoutes);
app.use('/api/seller', sellerRoutes);
app.use('/api/sellers', publicSellersRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/questions', questionRoutes);

// Initialize Socket.io service
const socketService = require('./services/socketService');
socketService.initialize(server);

// Make socket service accessible to routes
app.set('socketService', socketService);

// Initialize Auction Scheduler only if Firebase is available
if (db) {
  const auctionScheduler = require('./services/auctionScheduler');
  auctionScheduler.start();
} else {
  console.warn('Auction scheduler not started - Firebase not available');
}

// Health check endpoints for Railway
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Debug endpoint to check routes
app.get('/api', (req, res) => {
  res.status(200).json({
    message: 'API is working',
    routes: [
      '/api/products',
      '/api/users/dashboard',
      '/api/bids/my-bids',
      '/api/categories'
    ]
  });
});

// Serve static frontend files in production
if (process.env.NODE_ENV === 'production') {
  // Try multiple possible paths for frontend dist
  const possiblePaths = [
    path.join(__dirname, '../frontend/dist'),
    path.join(process.cwd(), 'frontend/dist'),
    path.join(process.cwd(), '../frontend/dist')
  ];

  let frontendPath = null;
  const fs = require('fs');

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      frontendPath = p;
      console.log('Frontend path found:', p);
      break;
    }
  }

  if (frontendPath) {
    // Serve static files
    app.use(express.static(frontendPath));

    // SPA catch-all - serve index.html for all non-API routes
    app.get('*', (req, res, next) => {
      // Skip if it's an API route
      if (req.path.startsWith('/api')) {
        return next();
      }
      res.sendFile(path.join(frontendPath, 'index.html'));
    });
  } else {
    console.warn('Frontend dist not found. Tried:', possiblePaths);
  }
}

// Error handling middleware - ensure CORS headers are set
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  console.error('Stack:', err.stack);
  
  // Ensure CORS headers are set even on errors
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  }
  
  res.status(err.status || 500).json({ 
    error: err.message || 'Something went wrong!',
    details: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

const PORT = process.env.PORT || 5000;
const HOST = '0.0.0.0'; // Important for Railway

// Start server with better error handling
const startServer = () => {
  server.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV}`);
    console.log('Server is ready to accept connections');
  console.log('Railway deployment active');
  });
};

// Handle server errors
server.on('error', (error) => {
  console.error('Server error:', error);
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use`);
    process.exit(1);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
  
  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Validate required environment variables
if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is required');
  process.exit(1);
}

// Start the server only if not in Vercel environment
if (process.env.VERCEL !== '1') {
  startServer();
}

// Export app for Vercel
module.exports = app;