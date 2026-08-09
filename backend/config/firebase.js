const admin = require('firebase-admin');

// Must precede any process.env read — see config/env.js for why bare
// dotenv.config() was not enough.
require('./env');

/**
 * True when the Firebase emulator suite is running for this process.
 *
 * The Admin SDK routes to the emulators purely off these env vars, and it does
 * not verify credentials when they are set — so a service-account key is neither
 * needed nor wanted locally.
 */
const usingEmulators = () =>
  !!(process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST);

// Initialize Firebase Admin SDK
const initializeFirebase = () => {
  try {
    /**
     * Emulator path.
     *
     * Without this, local development required a real production service
     * account, which meant every developer either had production write access or
     * could not run the backend at all. With the emulators there is nothing to
     * authenticate against, so we initialise with a project id alone.
     */
    if (usingEmulators()) {
      const projectId = process.env.FIREBASE_PROJECT_ID || 'verispine-local';
      admin.initializeApp({
        projectId,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`,
      });

      console.log('Firebase Admin SDK initialized against EMULATORS');
      console.log('  Project ID:', projectId);
      console.log('  Firestore :', process.env.FIRESTORE_EMULATOR_HOST || '(not set)');
      console.log('  Auth      :', process.env.FIREBASE_AUTH_EMULATOR_HOST || '(not set)');
      console.log('  Storage   :', process.env.FIREBASE_STORAGE_EMULATOR_HOST || '(not set)');
      return admin;
    }

    let serviceAccount;

    // Check if we have a single FIREBASE_SERVICE_ACCOUNT JSON string
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      console.log('Using FIREBASE_SERVICE_ACCOUNT JSON string');
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    }
    // Otherwise, check for separate environment variables
    else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      console.log('Using separate Firebase environment variables');
      serviceAccount = {
        type: "service_account",
        project_id: process.env.FIREBASE_PROJECT_ID,
        private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID || "",
        private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'), // Handle escaped newlines
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        client_id: process.env.FIREBASE_CLIENT_ID || "",
        auth_uri: "https://accounts.google.com/o/oauth2/auth",
        token_uri: "https://oauth2.googleapis.com/token",
        auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
        client_x509_cert_url: process.env.FIREBASE_CERT_URL || `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(process.env.FIREBASE_CLIENT_EMAIL)}`
      };
    }
    else {
      console.error('Firebase configuration not found!');
      console.error('Please set either:');
      console.error('1. FIREBASE_SERVICE_ACCOUNT as a complete JSON string, OR');
      console.error('2. FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY separately');
      return null;
    }

    if (!serviceAccount.project_id) {
      console.error('Firebase service account is invalid - missing project_id');
      return null;
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET
    });

    console.log('Firebase Admin SDK initialized successfully');
    console.log('Project ID:', serviceAccount.project_id);
    return admin;
  } catch (error) {
    console.error('Error initializing Firebase:', error.message);
    if (error.message.includes('JSON')) {
      console.error('Make sure FIREBASE_SERVICE_ACCOUNT is valid JSON and on a single line');
    }
    return null;
  }
};

let firebaseAdmin = null;
let db = null;
let auth = null;
let storage = null;

try {
  firebaseAdmin = initializeFirebase();
  if (firebaseAdmin) {
    db = admin.firestore();
    auth = admin.auth();
    storage = admin.storage();
  }
} catch (error) {
  console.error('Failed to initialize Firebase services:', error.message);
}

module.exports = {
  admin: firebaseAdmin,
  db,
  auth,
  storage,
  usingEmulators
};