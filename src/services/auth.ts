import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import { auth, ADMIN_UID, isFirebaseConfigured } from './firebase';

export interface AuthState {
  user: User | null;
  isAdmin: boolean;
  isLoading: boolean;
  error: string | null;
}

/**
 * Validates whether the logged-in Firebase user matches the authorized Admin UID.
 */
export function verifyIsAdmin(user: User | null): boolean {
  if (!user) return false;
  // Strict fail-closed verification: never allow any user if ADMIN_UID is not configured
  if (!ADMIN_UID || ADMIN_UID.trim().length === 0 || ADMIN_UID.includes('your-admin-uid')) {
    console.error('[Auth] VITE_FIREBASE_ADMIN_UID is not properly configured. Admin access denied.');
    return false;
  }
  return user.uid === ADMIN_UID;
}

/**
 * Sign in with email and password. Verifies Admin UID immediately.
 */
export async function adminLogin(email: string, password: string): Promise<User> {
  if (!isFirebaseConfigured || !auth) {
    throw new Error('Firebase is not configured. Please supply environment variables.');
  }

  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  const user = credential.user;

  if (!verifyIsAdmin(user)) {
    // If not the authorized Admin, sign out immediately to prevent unauthorized access
    await firebaseSignOut(auth);
    throw new Error('Access denied: You are not authorized as the Admin for this system.');
  }

  return user;
}

/**
 * Sign out the current user.
 */
export async function adminLogout(): Promise<void> {
  if (auth) {
    await firebaseSignOut(auth);
  }
}

/**
 * Listen to Firebase Auth state changes.
 */
export function subscribeToAuthState(
  callback: (user: User | null, isAdmin: boolean) => void
): () => void {
  if (!isFirebaseConfigured || !auth) {
    callback(null, false);
    return () => {};
  }

  return onAuthStateChanged(auth, (user) => {
    const isAdmin = verifyIsAdmin(user);
    if (user && !isAdmin && ADMIN_UID && !ADMIN_UID.includes('your-admin-uid')) {
      console.warn('[Auth] Non-admin user detected. Signing out...');
      firebaseSignOut(auth).finally(() => callback(null, false));
      return;
    }
    callback(user, isAdmin);
  });
}
