import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  CollectionReference,
  DocumentData,
  onSnapshot,
} from 'firebase/firestore';
import { firestore, isFirebaseConfigured } from './firebase';
import {
  Member,
  MealEntry,
  Expense,
  Deposit,
  Category,
  SystemSettings,
  ManagerPeriod,
  DailyMealClosure,
} from '../types';

// Collection Names
export const COLLECTIONS = {
  MEMBERS: 'members',
  MEAL_ENTRIES: 'mealEntries',
  EXPENSES: 'expenses',
  DEPOSITS: 'deposits',
  CATEGORIES: 'categories',
  MANAGERS: 'managers',
  DAILY_CLOSURES: 'dailyClosures',
  SETTINGS: 'settings',
  APP_METADATA: 'appMetadata',
  PUBLIC_PORTAL: 'public_portal',
} as const;

export type SyncState =
  | 'ONLINE_SYNCED'
  | 'ONLINE_SYNCING'
  | 'OFFLINE_WORKING'
  | 'SYNC_ERROR'
  | 'LOCAL_ONLY';

// Generic helper to get a typed collection
export function getCollectionRef<T = DocumentData>(collectionName: string): CollectionReference<T> | null {
  if (!isFirebaseConfigured || !firestore) return null;
  return collection(firestore, collectionName) as CollectionReference<T>;
}

// -----------------------------------------------------------------------------
// Document Upsert & Delete operations with stable IDs and conflict metadata
// -----------------------------------------------------------------------------

export async function upsertFirestoreDoc<T extends { id?: string }>(
  collectionName: string,
  docId: string,
  data: T
): Promise<void> {
  if (!isFirebaseConfigured || !firestore) return;

  const docRef = doc(firestore, collectionName, docId);
  const now = Date.now();

  const payload = {
    ...data,
    id: docId,
    _lastModifiedLocally: now,
    _serverTimestamp: serverTimestamp(),
  };

  await setDoc(docRef, payload, { merge: true });
}

export async function deleteFirestoreDoc(collectionName: string, docId: string): Promise<void> {
  if (!isFirebaseConfigured || !firestore) return;
  const docRef = doc(firestore, collectionName, docId);
  await deleteDoc(docRef);
}

// -----------------------------------------------------------------------------
// Batched Writes Helper (respects Firestore 500 operation limit)
// -----------------------------------------------------------------------------

export async function batchWriteDocs<T extends { id?: string }>(
  collectionName: string,
  items: T[],
  getId: (item: T) => string,
  onProgress?: (completed: number, total: number) => void
): Promise<number> {
  if (!isFirebaseConfigured || !firestore) return 0;
  if (items.length === 0) return 0;

  const BATCH_SIZE = 400; // Safe threshold well below 500 limit
  let completed = 0;

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const chunk = items.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(firestore);

    for (const item of chunk) {
      const docId = getId(item);
      const docRef = doc(firestore, collectionName, docId);
      const payload = {
        ...item,
        id: docId,
        _lastModifiedLocally: Date.now(),
        _serverTimestamp: serverTimestamp(),
      };
      batch.set(docRef, payload, { merge: true });
    }

    await batch.commit();
    completed += chunk.length;
    if (onProgress) {
      onProgress(completed, items.length);
    }
  }

  return completed;
}
