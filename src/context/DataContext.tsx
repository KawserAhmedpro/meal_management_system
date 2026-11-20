import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  collection,
  doc,
  onSnapshot,
  query,
  orderBy,
  Unsubscribe,
} from 'firebase/firestore';
import { firestore, isFirebaseConfigured } from '../services/firebase';
import { useAuth } from './AuthContext';
import { db } from '../db';
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
import { DEFAULT_SETTINGS, DEFAULT_CATEGORIES } from '../db/seedData';
import {
  COLLECTIONS,
  upsertFirestoreDoc,
  deleteFirestoreDoc,
  batchWriteDocs,
  SyncState,
} from '../services/firestore';

export interface DataContextType {
  // Realtime Collections
  members: Member[];
  mealEntries: MealEntry[];
  expenses: Expense[];
  deposits: Deposit[];
  categories: Category[];
  managers: ManagerPeriod[];
  dailyClosures: DailyMealClosure[];
  settings: SystemSettings;

  // Selected Month
  selectedMonth: string;
  setSelectedMonth: (month: string) => Promise<void>;

  // Sync state
  syncState: SyncState;
  pendingWritesCount: number;
  lastSyncedAt: Date | null;
  isCloudConnected: boolean;

  // Mutation methods
  saveMember: (member: Member) => Promise<void>;
  deleteMember: (id: string) => Promise<void>;
  saveMealEntry: (entry: MealEntry) => Promise<void>;
  saveMealEntriesBulk: (entries: MealEntry[]) => Promise<void>;
  saveExpense: (expense: Expense) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  saveDeposit: (deposit: Deposit) => Promise<void>;
  deleteDeposit: (id: string) => Promise<void>;
  saveManager: (manager: ManagerPeriod) => Promise<void>;
  deleteManager: (id: string) => Promise<void>;
  saveDailyClosure: (closure: DailyMealClosure) => Promise<void>;
  deleteDailyClosure: (date: string) => Promise<void>;
  updateSettings: (newSettings: Partial<SystemSettings>) => Promise<void>;

  // Global search & UI state
  globalSearch: string;
  setGlobalSearch: (q: string) => void;
  activeQuickModal: 'meal' | 'expense' | 'deposit' | 'member' | null;
  setActiveQuickModal: (modal: 'meal' | 'expense' | 'deposit' | 'member' | null) => void;
  isPinLocked: boolean;
  unlockWithPin: (pin: string) => boolean;
  lockApp: () => void;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAdmin } = useAuth();
  const isCloudActive = Boolean(isFirebaseConfigured && user && isAdmin && firestore);

  // Fallback Dexie queries
  const dexieMembers = useLiveQuery(() => db.members.toArray(), []) || [];
  const dexieMealEntries = useLiveQuery(() => db.mealEntries.toArray(), []) || [];
  const dexieExpenses = useLiveQuery(() => db.expenses.toArray(), []) || [];
  const dexieDeposits = useLiveQuery(() => db.deposits.toArray(), []) || [];
  const dexieCategories = useLiveQuery(() => db.categories.toArray(), []) || [];
  const dexieManagers = useLiveQuery(() => db.managers.orderBy('startDate').toArray(), []) || [];
  const dexieClosures = useLiveQuery(() => db.dailyClosures.toArray(), []) || [];
  const dexieSettings = useLiveQuery(() => db.settings.get('app_settings'), []) || DEFAULT_SETTINGS;

  // Cloud State
  const [cloudMembers, setCloudMembers] = useState<Member[] | null>(null);
  const [cloudMealEntries, setCloudMealEntries] = useState<MealEntry[] | null>(null);
  const [cloudExpenses, setCloudExpenses] = useState<Expense[] | null>(null);
  const [cloudDeposits, setCloudDeposits] = useState<Deposit[] | null>(null);
  const [cloudCategories, setCloudCategories] = useState<Category[] | null>(null);
  const [cloudManagers, setCloudManagers] = useState<ManagerPeriod[] | null>(null);
  const [cloudClosures, setCloudClosures] = useState<DailyMealClosure[] | null>(null);
  const [cloudSettings, setCloudSettings] = useState<SystemSettings | null>(null);

  // Sync Diagnostics
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [hasPendingWrites, setHasPendingWrites] = useState<boolean>(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  // UI state
  const [selectedMonth, setSelectedMonthState] = useState<string>('2026-03');
  const [isPinLocked, setIsPinLocked] = useState<boolean>(false);
  const [globalSearch, setGlobalSearch] = useState<string>('');
  const [activeQuickModal, setActiveQuickModal] = useState<'meal' | 'expense' | 'deposit' | 'member' | null>(null);

  // Network listener
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Set up Firestore realtime listeners when Cloud is active
  useEffect(() => {
    if (!isCloudActive || !firestore) {
      setCloudMembers(null);
      setCloudMealEntries(null);
      setCloudExpenses(null);
      setCloudDeposits(null);
      setCloudCategories(null);
      setCloudManagers(null);
      setCloudClosures(null);
      setCloudSettings(null);
      return;
    }

    const unsubscribers: Unsubscribe[] = [];
    let pendingAny = false;

    const checkPending = (snapshotMetadata: { hasPendingWrites: boolean }) => {
      if (snapshotMetadata.hasPendingWrites) {
        pendingAny = true;
        setHasPendingWrites(true);
      } else {
        setHasPendingWrites(false);
        setLastSyncedAt(new Date());
      }
    };

    try {
      // 1. Members
      const qMembers = query(collection(firestore, COLLECTIONS.MEMBERS));
      unsubscribers.push(
        onSnapshot(
          qMembers,
          { includeMetadataChanges: true },
          (snapshot) => {
            checkPending(snapshot.metadata);
            const list: Member[] = [];
            snapshot.forEach((d) => list.push(d.data() as Member));
            setCloudMembers(list);
            // Background cache mirror to Dexie
            if (list.length > 0) db.members.bulkPut(list).catch(() => {});
          },
          (err) => setSyncError(err.message)
        )
      );

      // 2. Meal Entries
      const qMeals = query(collection(firestore, COLLECTIONS.MEAL_ENTRIES));
      unsubscribers.push(
        onSnapshot(
          qMeals,
          { includeMetadataChanges: true },
          (snapshot) => {
            checkPending(snapshot.metadata);
            const list: MealEntry[] = [];
            snapshot.forEach((d) => list.push(d.data() as MealEntry));
            setCloudMealEntries(list);
            if (list.length > 0) db.mealEntries.bulkPut(list).catch(() => {});
          },
          (err) => setSyncError(err.message)
        )
      );

      // 3. Expenses
      const qExpenses = query(collection(firestore, COLLECTIONS.EXPENSES));
      unsubscribers.push(
        onSnapshot(
          qExpenses,
          { includeMetadataChanges: true },
          (snapshot) => {
            checkPending(snapshot.metadata);
            const list: Expense[] = [];
            snapshot.forEach((d) => list.push(d.data() as Expense));
            setCloudExpenses(list);
            if (list.length > 0) db.expenses.bulkPut(list).catch(() => {});
          },
          (err) => setSyncError(err.message)
        )
      );

      // 4. Deposits
      const qDeposits = query(collection(firestore, COLLECTIONS.DEPOSITS));
      unsubscribers.push(
        onSnapshot(
          qDeposits,
          { includeMetadataChanges: true },
          (snapshot) => {
            checkPending(snapshot.metadata);
            const list: Deposit[] = [];
            snapshot.forEach((d) => list.push(d.data() as Deposit));
            setCloudDeposits(list);
            if (list.length > 0) db.deposits.bulkPut(list).catch(() => {});
          },
          (err) => setSyncError(err.message)
        )
      );

      // 5. Managers
      const qManagers = query(collection(firestore, COLLECTIONS.MANAGERS), orderBy('startDate', 'asc'));
      unsubscribers.push(
        onSnapshot(
          qManagers,
          { includeMetadataChanges: true },
          (snapshot) => {
            checkPending(snapshot.metadata);
            const list: ManagerPeriod[] = [];
            snapshot.forEach((d) => list.push(d.data() as ManagerPeriod));
            setCloudManagers(list);
            if (list.length > 0) db.managers.bulkPut(list).catch(() => {});
          },
          (err) => setSyncError(err.message)
        )
      );

      // 6. Closures
      const qClosures = query(collection(firestore, COLLECTIONS.DAILY_CLOSURES));
      unsubscribers.push(
        onSnapshot(
          qClosures,
          { includeMetadataChanges: true },
          (snapshot) => {
            checkPending(snapshot.metadata);
            const list: DailyMealClosure[] = [];
            snapshot.forEach((d) => list.push(d.data() as DailyMealClosure));
            setCloudClosures(list);
            if (list.length > 0) db.dailyClosures.bulkPut(list).catch(() => {});
          },
          (err) => setSyncError(err.message)
        )
      );

      // 7. Categories
      const qCategories = query(collection(firestore, COLLECTIONS.CATEGORIES));
      unsubscribers.push(
        onSnapshot(
          qCategories,
          { includeMetadataChanges: true },
          (snapshot) => {
            checkPending(snapshot.metadata);
            const list: Category[] = [];
            snapshot.forEach((d) => list.push(d.data() as Category));
            setCloudCategories(list);
            if (list.length > 0) db.categories.bulkPut(list).catch(() => {});
          },
          (err) => setSyncError(err.message)
        )
      );

      // 8. Settings
      const settingsDocRef = doc(firestore, COLLECTIONS.SETTINGS, 'app_settings');
      unsubscribers.push(
        onSnapshot(
          settingsDocRef,
          { includeMetadataChanges: true },
          (snapshot) => {
            checkPending(snapshot.metadata);
            if (snapshot.exists()) {
              const data = snapshot.data() as SystemSettings;
              setCloudSettings(data);
              db.settings.put(data).catch(() => {});
            }
          },
          (err) => setSyncError(err.message)
        )
      );
    } catch (e: any) {
      console.warn('[DataContext] Listener setup error:', e);
      setSyncError(e.message);
    }

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [isCloudActive]);

  // Determine Effective Data Sources: Prefer Cloud if active & populated, otherwise Dexie
  const members = useMemo(
    () => (isCloudActive && cloudMembers !== null ? cloudMembers : dexieMembers),
    [isCloudActive, cloudMembers, dexieMembers]
  );

  const mealEntries = useMemo(
    () => (isCloudActive && cloudMealEntries !== null ? cloudMealEntries : dexieMealEntries),
    [isCloudActive, cloudMealEntries, dexieMealEntries]
  );

  const expenses = useMemo(
    () => (isCloudActive && cloudExpenses !== null ? cloudExpenses : dexieExpenses),
    [isCloudActive, cloudExpenses, dexieExpenses]
  );

  const deposits = useMemo(
    () => (isCloudActive && cloudDeposits !== null ? cloudDeposits : dexieDeposits),
    [isCloudActive, cloudDeposits, dexieDeposits]
  );

  const categories = useMemo(
    () => (isCloudActive && cloudCategories !== null ? cloudCategories : dexieCategories),
    [isCloudActive, cloudCategories, dexieCategories]
  );

  const managers = useMemo(
    () => (isCloudActive && cloudManagers !== null ? cloudManagers : dexieManagers),
    [isCloudActive, cloudManagers, dexieManagers]
  );

  const dailyClosures = useMemo(
    () => (isCloudActive && cloudClosures !== null ? cloudClosures : dexieClosures),
    [isCloudActive, cloudClosures, dexieClosures]
  );

  const settings: SystemSettings = useMemo(
    () => (isCloudActive && cloudSettings !== null ? cloudSettings : dexieSettings),
    [isCloudActive, cloudSettings, dexieSettings]
  );

  // Sync state calculation
  const syncState: SyncState = useMemo(() => {
    if (!isCloudActive) return 'LOCAL_ONLY';
    if (syncError) return 'SYNC_ERROR';
    if (!isOnline) return 'OFFLINE_WORKING';
    if (hasPendingWrites) return 'ONLINE_SYNCING';
    return 'ONLINE_SYNCED';
  }, [isCloudActive, syncError, isOnline, hasPendingWrites]);

  // Selected Month Synchronization
  useEffect(() => {
    if (settings.selectedMonth && settings.selectedMonth !== selectedMonth) {
      setSelectedMonthState(settings.selectedMonth);
    }
  }, [settings.selectedMonth]);

  const setSelectedMonth = async (month: string) => {
    setSelectedMonthState(month);
    await updateSettings({ selectedMonth: month });
  };

  // ---------------------------------------------------------------------------
  // Mutations (Unified Cloud + Dexie Dual-Write)
  // ---------------------------------------------------------------------------

  const saveMember = async (member: Member) => {
    await db.members.put(member);
    if (isCloudActive) {
      await upsertFirestoreDoc(COLLECTIONS.MEMBERS, member.id, member);
    }
  };

  const deleteMember = async (id: string) => {
    await db.members.delete(id);
    if (isCloudActive) {
      await deleteFirestoreDoc(COLLECTIONS.MEMBERS, id);
    }
  };

  const saveMealEntry = async (entry: MealEntry) => {
    await db.mealEntries.put(entry);
    if (isCloudActive) {
      await upsertFirestoreDoc(COLLECTIONS.MEAL_ENTRIES, entry.id, entry);
    }
  };

  const saveMealEntriesBulk = async (entries: MealEntry[]) => {
    await db.mealEntries.bulkPut(entries);
    if (isCloudActive) {
      await batchWriteDocs(COLLECTIONS.MEAL_ENTRIES, entries, (e) => e.id);
    }
  };

  const saveExpense = async (expense: Expense) => {
    await db.expenses.put(expense);
    if (isCloudActive) {
      await upsertFirestoreDoc(COLLECTIONS.EXPENSES, expense.id, expense);
    }
  };

  const deleteExpense = async (id: string) => {
    await db.expenses.delete(id);
    if (isCloudActive) {
      await deleteFirestoreDoc(COLLECTIONS.EXPENSES, id);
    }
  };

  const saveDeposit = async (deposit: Deposit) => {
    await db.deposits.put(deposit);
    if (isCloudActive) {
      await upsertFirestoreDoc(COLLECTIONS.DEPOSITS, deposit.id, deposit);
    }
  };

  const deleteDeposit = async (id: string) => {
    await db.deposits.delete(id);
    if (isCloudActive) {
      await deleteFirestoreDoc(COLLECTIONS.DEPOSITS, id);
    }
  };

  const saveManager = async (manager: ManagerPeriod) => {
    await db.managers.put(manager);
    if (isCloudActive) {
      await upsertFirestoreDoc(COLLECTIONS.MANAGERS, manager.id, manager);
    }
  };

  const deleteManager = async (id: string) => {
    await db.managers.delete(id);
    if (isCloudActive) {
      await deleteFirestoreDoc(COLLECTIONS.MANAGERS, id);
    }
  };

  const saveDailyClosure = async (closure: DailyMealClosure) => {
    await db.dailyClosures.put(closure);
    if (isCloudActive) {
      await upsertFirestoreDoc(COLLECTIONS.DAILY_CLOSURES, closure.date, closure);
    }
  };

  const deleteDailyClosure = async (date: string) => {
    await db.dailyClosures.delete(date);
    if (isCloudActive) {
      await deleteFirestoreDoc(COLLECTIONS.DAILY_CLOSURES, date);
    }
  };

  const updateSettings = async (newSettings: Partial<SystemSettings>) => {
    const updated: SystemSettings = {
      ...settings,
      ...newSettings,
      id: 'app_settings',
    };
    await db.settings.put(updated);
    if (isCloudActive) {
      await upsertFirestoreDoc(COLLECTIONS.SETTINGS, 'app_settings', updated);
    }
  };

  const unlockWithPin = (enteredPin: string): boolean => {
    if (!settings.pinLockEnabled) {
      setIsPinLocked(false);
      return true;
    }
    if (enteredPin === settings.pinCode) {
      setIsPinLocked(false);
      return true;
    }
    return false;
  };

  const lockApp = () => {
    if (settings.pinLockEnabled) {
      setIsPinLocked(true);
    }
  };

  return (
    <DataContext.Provider
      value={{
        members,
        mealEntries,
        expenses,
        deposits,
        categories,
        managers,
        dailyClosures,
        settings,
        selectedMonth,
        setSelectedMonth,
        syncState,
        pendingWritesCount: hasPendingWrites ? 1 : 0,
        lastSyncedAt,
        isCloudConnected: isCloudActive,
        saveMember,
        deleteMember,
        saveMealEntry,
        saveMealEntriesBulk,
        saveExpense,
        deleteExpense,
        saveDeposit,
        deleteDeposit,
        saveManager,
        deleteManager,
        saveDailyClosure,
        deleteDailyClosure,
        updateSettings,
        globalSearch,
        setGlobalSearch,
        activeQuickModal,
        setActiveQuickModal,
        isPinLocked,
        unlockWithPin,
        lockApp,
      }}
    >
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};
