// firebase-config.ts
import { initializeApp, getApps } from 'firebase/app';

const firebaseConfig = {
  apiKey: "AIzaSyAujb8cZT7RCichkNbfairTknXEDf8dEsc",
  authDomain: "avenueconnect-dev.firebaseapp.com",
  projectId: "avenueconnect-dev",
  storageBucket: "avenueconnect-dev.firebasestorage.app",
  messagingSenderId: "126785476414",
  appId: "1:126785476414:android:3d4b108655ace2d96b7e6f",
};

export const firebaseApp =
  getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
