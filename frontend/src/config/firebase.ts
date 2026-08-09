import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";

/**
 * Firebase web config, read from the environment.
 *
 * These values are not secret — they ship in the bundle either way — but keeping
 * them out of the source means the repo is not tied to one project. The old
 * codebase hardcoded them, which is how a staging build ended up pointed at
 * production. Access control lives in firestore.rules and storage.rules.
 */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Fail loudly at startup rather than with an opaque Firebase error on first use.
const missing = Object.entries(firebaseConfig)
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (missing.length) {
  throw new Error(
    `Firebase config is incomplete — missing: ${missing.join(', ')}. ` +
    `Set the matching VITE_FIREBASE_* variables in frontend/.env`
  );
}

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

/**
 * Local development against the Firebase emulator suite.
 *
 * Guarded by DEV as well as the flag so that a stray VITE_USE_FIREBASE_EMULATORS
 * in a production build cannot silently point real users at localhost — the app
 * would appear to work while writing nowhere.
 */
if (import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
  console.info('[firebase] Connected to local emulators');
}

export default app;
