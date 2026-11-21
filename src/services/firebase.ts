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
  apiKey: env?.VITE_FIREBASE_API_KEY || '',
  authDomain: env?.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: env?.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: env?.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: env?.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: env?.VITE_FIREBASE_APP_ID || '',
};

export const ADMIN_UID: string = env?.VITE_FIREBASE_ADMIN_UID || '';

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
