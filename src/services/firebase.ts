import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  Firestore,
  getFirestore,
} from 'firebase/firestore';

export interface FirebaseConfigStatus {
  isConfigured: boolean;
  missingKeys: string[];
}

const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : (typeof process !== 'undefined' ? (process.env as unknown as ImportMetaEnv) : {}) as unknown as ImportMetaEnv;

export const firebaseConfig = {
  apiKey: env?.VITE_FIREBASE_API_KEY || 'AIzaSyA9JX2F-bsOtx7CyQ2mVqLuRvz4ZV09buI',
  authDomain: env?.VITE_FIREBASE_AUTH_DOMAIN || 'dainingmanagementsystem.firebaseapp.com',
  projectId: env?.VITE_FIREBASE_PROJECT_ID || 'dainingmanagementsystem',
  storageBucket: env?.VITE_FIREBASE_STORAGE_BUCKET || 'dainingmanagementsystem.firebasestorage.app',
  messagingSenderId: env?.VITE_FIREBASE_MESSAGING_SENDER_ID || '684588432592',
  appId: env?.VITE_FIREBASE_APP_ID || '1:684588432592:web:5e05bec103fe398ede32d5',
};

export const ADMIN_UID: string = env?.VITE_FIREBASE_ADMIN_UID || 'iSOfrQnFU2gxQekEFUOjSOSeEi82';

export function getFirebaseConfigStatus(): FirebaseConfigStatus {
  const missingKeys: string[] = [];
  if (!firebaseConfig.apiKey || firebaseConfig.apiKey.includes('your-api-key')) missingKeys.push('VITE_FIREBASE_API_KEY');
  if (!firebaseConfig.authDomain) missingKeys.push('VITE_FIREBASE_AUTH_DOMAIN');
  if (!firebaseConfig.projectId || firebaseConfig.projectId.includes('your-project-id')) missingKeys.push('VITE_FIREBASE_PROJECT_ID');
  if (!firebaseConfig.appId) missingKeys.push('VITE_FIREBASE_APP_ID');

  return {
    isConfigured: missingKeys.length === 0,
    missingKeys,
  };
}

export const isFirebaseConfigured = getFirebaseConfigStatus().isConfigured;

let appInstance: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let firestoreInstance: Firestore | null = null;

if (isFirebaseConfigured) {
  try {
    appInstance = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    authInstance = getAuth(appInstance);

    // Initialize Cloud Firestore with multi-tab offline persistent cache
    try {
      firestoreInstance = initializeFirestore(appInstance, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      });
      console.log('✓ Firestore initialized with multi-tab persistent offline cache');
    } catch {
      firestoreInstance = getFirestore(appInstance);
    }
  } catch (error) {
    console.warn('Firebase initialization warning:', error);
  }
}

export const app = appInstance;
export const auth = authInstance;
export const firestore = firestoreInstance;
