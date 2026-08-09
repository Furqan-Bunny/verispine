const admin = require('firebase-admin');
const dotenv = require('dotenv');

dotenv.config();

// Initialize Firebase Admin SDK
const initializeFirebase = () => {
  try {
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
  storage
};