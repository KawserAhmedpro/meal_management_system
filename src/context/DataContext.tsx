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
  SyncState,
} from '../services/firestore';
import { DataMutationGateway } from '../services/dataGateway';
import { outboxFlusher, SyncDiagnostics } from '../services/outboxFlusher';
import { safeInboundSync } from '../services/inboundSync';
import {
  sanitizeAndBuildPublicData,
  publishMonthToPublicPortal,
  publishPublicPortalMeta,
  getPublicPortalUrl,
  buildPublicCurrentManagerSummary,
  buildPublicAllManagersSummary,
} from '../services/publicPortal';

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
  createMember: (memberData: Omit<Member, 'id'> | Member) => Promise<Member>;
  saveMember: (member: Member) => Promise<void>;
  deleteMember: (id: string) => Promise<void>;
  saveMealEntry: (entry: MealEntry) => Promise<void>;
  saveMealEntriesBulk: (entries: MealEntry[]) => Promise<void>;
  saveExpense: (expense: Expense) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  saveDeposit: (deposit: Deposit) => Promise<void>;
  deleteDeposit: (id: string) => Promise<void>;
  saveCategory: (category: Category) => Promise<void>;
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

  // Public Member Portal
  isPublicSyncing: boolean;
  lastPublicSyncedAt: Date | null;
  publicPortalUrl: string;
  syncPublicPortal: (monthToSync?: string) => Promise<boolean>;
  syncAllPublicPortalMonths: () => Promise<number>;
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
  const [syncDiagnostics, setSyncDiagnostics] = useState<SyncDiagnostics | null>(null);

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
            // Safe Inbound Sync to Dexie
            if (list.length > 0) {
              safeInboundSync(db.members, COLLECTIONS.MEMBERS, list, (m) => m.id).catch((err) =>
                console.error('[DataContext] Inbound sync error for members:', err)
              );
            }
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
            if (list.length > 0) {
              safeInboundSync(db.mealEntries, COLLECTIONS.MEAL_ENTRIES, list, (m) => m.id).catch((err) =>
                console.error('[DataContext] Inbound sync error for meal entries:', err)
              );
            }
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
            if (list.length > 0) {
              safeInboundSync(db.expenses, COLLECTIONS.EXPENSES, list, (e) => e.id).catch((err) =>
                console.error('[DataContext] Inbound sync error for expenses:', err)
              );
            }
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
            if (list.length > 0) {
              safeInboundSync(db.deposits, COLLECTIONS.DEPOSITS, list, (d) => d.id).catch((err) =>
                console.error('[DataContext] Inbound sync error for deposits:', err)
              );
            }
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
            if (list.length > 0) {
              safeInboundSync(db.managers, COLLECTIONS.MANAGERS, list, (m) => m.id).catch((err) =>
                console.error('[DataContext] Inbound sync error for managers:', err)
              );
            }
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
            if (list.length > 0) {
              safeInboundSync(db.dailyClosures, COLLECTIONS.DAILY_CLOSURES, list, (c) => c.date).catch((err) =>
                console.error('[DataContext] Inbound sync error for closures:', err)
              );
            }
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
            if (list.length > 0) {
              safeInboundSync(db.categories, COLLECTIONS.CATEGORIES, list, (c) => c.id).catch((err) =>
                console.error('[DataContext] Inbound sync error for categories:', err)
              );
            }
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
              safeInboundSync(db.settings, COLLECTIONS.SETTINGS, [data], () => 'app_settings').catch((err) =>
                console.error('[DataContext] Inbound sync error for settings:', err)
              );
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

  // Start Outbox Flusher lifecycle when cloud is active
  useEffect(() => {
    if (!isCloudActive) {
      outboxFlusher.stopPeriodicSync();
      return;
    }

    outboxFlusher.startPeriodicSync();
    const unsubscribeFlusher = outboxFlusher.subscribe((diag) => {
      setSyncDiagnostics(diag);
      if (diag.lastFlushedAt) {
        setLastSyncedAt(new Date(diag.lastFlushedAt));
      }
    });

    return () => {
      unsubscribeFlusher();
      outboxFlusher.stopPeriodicSync();
    };
  }, [isCloudActive]);

  // Determine Effective Data Sources: Local-First (Dexie is always authoritative local operational storage)
  const members = dexieMembers;
  const mealEntries = dexieMealEntries;
  const expenses = dexieExpenses;
  const deposits = dexieDeposits;
  const categories = dexieCategories;
  const managers = dexieManagers;
  const dailyClosures = dexieClosures;
  const settings: SystemSettings = dexieSettings;

  // Sync state calculation based on Outbox and Diagnostics
  const syncState: SyncState = useMemo(() => {
    if (!isCloudActive) return 'LOCAL_ONLY';
    if (!isOnline) return 'OFFLINE_WORKING';
    if (syncDiagnostics?.conflictsCount && syncDiagnostics.conflictsCount > 0) return 'SYNC_CONFLICT';
    if (syncDiagnostics?.quarantinedCount && syncDiagnostics.quarantinedCount > 0) return 'SYNC_CONFLICT';
    if (syncDiagnostics?.status === 'syncing' || hasPendingWrites) return 'ONLINE_SYNCING';
    if (syncDiagnostics?.status === 'error' || syncError) return 'SYNC_ERROR';
    return 'ONLINE_SYNCED';
  }, [isCloudActive, isOnline, syncDiagnostics, hasPendingWrites, syncError]);

  const pendingWritesCount = useMemo(() => {
    return (syncDiagnostics?.pendingCount || 0) + (syncDiagnostics?.leasedCount || 0);
  }, [syncDiagnostics]);

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
  // Mutations (Local-First Gateway + Outbox Synchronization)
  // All mutations atomically commit to Dexie + Outbox, then trigger sync
  // ---------------------------------------------------------------------------

  const createMember = async (memberData: Omit<Member, 'id'> | Member): Promise<Member> => {
    const { entity } = await DataMutationGateway.createMember(memberData);
    if (isCloudActive) {
      outboxFlusher.triggerSync();
    }
    return entity;
  };

  const saveMember = async (member: Member) => {
    await DataMutationGateway.saveMember(member);
    if (isCloudActive) {
      outboxFlusher.triggerSync();
    }
  };

  const deleteMember = async (id: string) => {
    await DataMutationGateway.deleteMember(id);
    if (isCloudActive) {
      outboxFlusher.triggerSync();
    }
  };

  const saveMealEntry = async (entry: MealEntry) => {
    await DataMutationGateway.saveMealEntry(entry);
    if (isCloudActive) {
      outboxFlusher.triggerSync();
    }
  };

  const saveMealEntriesBulk = async (entries: MealEntry[]) => {
    await DataMutationGateway.saveMealEntriesBulk(entries);
    if (isCloudActive) {
      outboxFlusher.triggerSync();
    }
  };

  const saveExpense = async (expense: Expense) => {
    await DataMutationGateway.saveExpense(expense);
    if (isCloudActive) {
      outboxFlusher.triggerSync();
    }
  };

  const deleteExpense = async (id: string) => {
    await DataMutationGateway.deleteExpense(id);
    if (isCloudActive) {
      outboxFlusher.triggerSync();
    }
  };

  const saveDeposit = async (deposit: Deposit) => {
    await DataMutationGateway.saveDeposit(deposit);
    if (isCloudActive) {
      outboxFlusher.triggerSync();
    }
  };

  const deleteDeposit = async (id: string) => {
    await DataMutationGateway.deleteDeposit(id);
    if (isCloudActive) {
      outboxFlusher.triggerSync();
    }
  };

  const saveCategory = async (category: Category) => {
    await DataMutationGateway.saveCategory(category);
    if (isCloudActive) {
      outboxFlusher.triggerSync();
    }
  };

  const saveManager = async (manager: ManagerPeriod) => {
    await DataMutationGateway.saveManager(manager);
    if (isCloudActive) {
      outboxFlusher.triggerSync();
    }
  };

  const deleteManager = async (id: string) => {
    await DataMutationGateway.deleteManager(id);
    if (isCloudActive) {
      outboxFlusher.triggerSync();
    }
  };

  const saveDailyClosure = async (closure: DailyMealClosure) => {
    await DataMutationGateway.saveDailyClosure(closure);
    if (isCloudActive) {
      outboxFlusher.triggerSync();
    }
  };

  const deleteDailyClosure = async (date: string) => {
    await DataMutationGateway.deleteDailyClosure(date);
    if (isCloudActive) {
      outboxFlusher.triggerSync();
    }
  };

  const updateSettings = async (newSettings: Partial<SystemSettings>) => {
    await DataMutationGateway.updateSettings(newSettings);
    if (isCloudActive) {
      outboxFlusher.triggerSync();
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

  // ---------------------------------------------------------------------------
  // Public Member Portal Synchronization (Sanitized, Read-Only, No Private Data)
  // ---------------------------------------------------------------------------
  const [isPublicSyncing, setIsPublicSyncing] = useState<boolean>(false);
  const [lastPublicSyncedAt, setLastPublicSyncedAt] = useState<Date | null>(null);
  const publicPortalUrl = useMemo(() => getPublicPortalUrl(), []);

  const syncPublicPortal = async (monthToSync?: string): Promise<boolean> => {
    if (!isCloudActive) {
      console.warn('Cannot sync public portal: Cloud is not active or user is not Admin.');
      return false;
    }
    const targetMonth = monthToSync || selectedMonth;
    setIsPublicSyncing(true);

    try {
      // 1. Build sanitized public data (strictly strips deposits, balances, phone numbers, notes)
      const publicData = sanitizeAndBuildPublicData(
        targetMonth,
        members,
        mealEntries,
        expenses,
        dailyClosures,
        settings,
        managers
      );

      // 2. Publish to public_portal/{month}
      await publishMonthToPublicPortal(publicData);

      // 3. Collect distinct months available
      const allMonthsSet = new Set<string>();
      allMonthsSet.add(targetMonth);
      for (const m of mealEntries) if (m.month) allMonthsSet.add(m.month);
      for (const e of expenses) if (e.month) allMonthsSet.add(e.month);
      const availableMonths = Array.from(allMonthsSet).sort().reverse();

      // 4. Compute single authoritative public Manager Assignment Period Summary & All Managers
      const currentManagerSummary = buildPublicCurrentManagerSummary(
        dexieManagers,
        dexieMealEntries,
        dexieExpenses,
        dexieClosures,
        settings.managerFeePerMeal || 5
      );
      const availableManagers = buildPublicAllManagersSummary(
        dexieManagers,
        dexieMealEntries,
        dexieExpenses,
        dexieClosures,
        settings.managerFeePerMeal || 5
      );

      // 5. Publish public_portal/meta (Single source of truth for manager summary)
      await publishPublicPortalMeta({
        messName: settings.messName || 'DINING MANAGEMENT SYSTEM',
        institutionName: settings.institutionName || '',
        hallName: settings.hallName || '',
        currencySymbol: settings.currencySymbol || '৳',
        activeMonth: targetMonth,
        availableMonths,
        lastPublishedAt: Date.now(),
        currentManager: currentManagerSummary,
        availableManagers,
      });

      setLastPublicSyncedAt(new Date());
      return true;
    } catch (err) {
      console.error('Failed to synchronize public portal:', err);
      throw err;
    } finally {
      setIsPublicSyncing(false);
    }
  };

  const syncAllPublicPortalMonths = async (): Promise<number> => {
    if (!isCloudActive) {
      console.warn('Cannot sync public portal: Cloud is not active or user is not Admin.');
      return 0;
    }
    setIsPublicSyncing(true);
    let count = 0;

    try {
      const allMonthsSet = new Set<string>();
      allMonthsSet.add(selectedMonth);
      for (const m of mealEntries) if (m.month) allMonthsSet.add(m.month);
      for (const e of expenses) if (e.month) allMonthsSet.add(e.month);
      const monthsList = Array.from(allMonthsSet);

      for (const m of monthsList) {
        const publicData = sanitizeAndBuildPublicData(
          m,
          members,
          mealEntries,
          expenses,
          dailyClosures,
          settings,
          managers
        );
        await publishMonthToPublicPortal(publicData);
        count++;
      }

      // Compute authoritative managers from Dexie
      const dexieManagers = await db.managers.toArray();
      const dexieMealEntries = await db.mealEntries.toArray();
      const dexieExpenses = await db.expenses.toArray();
      const dexieClosures = await db.dailyClosures.toArray();

      const currentManagerSummary = buildPublicCurrentManagerSummary(
        dexieManagers,
        dexieMealEntries,
        dexieExpenses,
        dexieClosures,
        settings.managerFeePerMeal || 5
      );
      const availableManagers = buildPublicAllManagersSummary(
        dexieManagers,
        dexieMealEntries,
        dexieExpenses,
        dexieClosures,
        settings.managerFeePerMeal || 5
      );

      await publishPublicPortalMeta({
        messName: settings.messName || 'DINING MANAGEMENT SYSTEM',
        institutionName: settings.institutionName || '',
        hallName: settings.hallName || '',
        currencySymbol: settings.currencySymbol || '৳',
        activeMonth: selectedMonth,
        availableMonths: monthsList.sort().reverse(),
        lastPublishedAt: Date.now(),
        currentManager: currentManagerSummary,
        availableManagers,
      });

      setLastPublicSyncedAt(new Date());
      return count;
    } catch (err) {
      console.error('Failed to publish all public portal months:', err);
      throw err;
    } finally {
      setIsPublicSyncing(false);
    }
  };

  // Debounced auto-publish to Public Portal when dining data or managers change
  useEffect(() => {
    if (!isCloudActive) return;
    if (members.length === 0 && mealEntries.length === 0 && expenses.length === 0) return;

    const timer = setTimeout(() => {
      syncPublicPortal(selectedMonth).catch(() => {});
    }, 2500);

    return () => clearTimeout(timer);
  }, [
    isCloudActive,
    selectedMonth,
    members.length,
    mealEntries.length,
    expenses.length,
    dailyClosures.length,
    managers,
    settings.managerFeePerMeal,
    settings.messName,
  ]);

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
        pendingWritesCount,
        lastSyncedAt,
        isCloudConnected: isCloudActive,
        createMember,
        saveMember,
        deleteMember,
        saveMealEntry,
        saveMealEntriesBulk,
        saveExpense,
        deleteExpense,
        saveDeposit,
        deleteDeposit,
        saveCategory,
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
        isPublicSyncing,
        lastPublicSyncedAt,
        publicPortalUrl,
        syncPublicPortal,
        syncAllPublicPortalMonths,
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
