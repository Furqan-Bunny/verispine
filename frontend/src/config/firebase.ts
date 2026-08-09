// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyA9THl_SNKyazeQAEBV_PQUE10y9PqvGR4",
  authDomain: "quicksell-80aad.firebaseapp.com",
  projectId: "quicksell-80aad",
  storageBucket: "quicksell-80aad.firebasestorage.app",
  messagingSenderId: "268405827471",
  appId: "1:268405827471:web:60468bf66f1f1100670dfa"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;