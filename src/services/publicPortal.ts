import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { firestore, isFirebaseConfigured } from './firebase';
import {
  Member,
  MealEntry,
  Expense,
  DailyMealClosure,
  SystemSettings,
  ManagerPeriod,
  MealStatus,
} from '../types';
import {
  PublicPortalMeta,
  PublicMonthData,
  PublicDailyMealSummary,
  PublicExpenseItem,
  PublicMemberInfo,
  PublicCurrentManagerSummary,
} from '../types/publicPortal';
import {
  calculateMonthSummary,
  calculateManagerAssignmentPeriodAccounting,
  isManagerActiveOnDate,
} from '../utils/calculations';

export const PUBLIC_PORTAL_COLLECTION = 'public_portal';

/**
 * Recursively removes undefined fields from an object or array.
 * Firestore strictly rejects documents containing undefined values.
 */
export function removeUndefined<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return null as unknown as T;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => removeUndefined(item)) as unknown as T;
  }
  if (typeof obj === 'object') {
    const cleaned: Record<string, any> = {};
    for (const [key, val] of Object.entries(obj)) {
      if (val !== undefined) {
        cleaned[key] = removeUndefined(val);
      }
    }
    return cleaned as T;
  }
  return obj;
}

/**
 * Returns the shareable Public Portal URL
 */
export function getPublicPortalUrl(): string {
  const base = import.meta.env.BASE_URL || '/';
  const cleanBase = base.endsWith('/') ? base : `${base}/`;
  return `${window.location.origin}${cleanBase}public`;
}

/**
 * Sanitizes and generates approved public data for a given month.
 * Strictly strips individual deposits, personal dues, advances, phones, and private notes.
 */
export function sanitizeAndBuildPublicData(
  month: string,
  members: Member[],
  mealEntries: MealEntry[],
  expenses: Expense[],
  dailyClosures: DailyMealClosure[],
  settings: SystemSettings,
  managers: ManagerPeriod[] = []
): PublicMonthData {
  // 1. Calculate overview using the system's official calculation logic
  const { overview, memberSummaries } = calculateMonthSummary(
    month,
    members,
    mealEntries,
    expenses,
    [], // Pass empty deposits so no deposits are computed or leaked
    settings.managerFeePerMeal,
    dailyClosures,
    managers
  );

  const [yearStr, monthStr] = month.split('-');
  const year = parseInt(yearStr);
  const monthNum = parseInt(monthStr);
  const daysInMonth = new Date(year, monthNum, 0).getDate();

  // 2. Filter month meals and closures
  const monthMeals = mealEntries.filter((m) => m.month === month);
  const monthClosures = dailyClosures.filter((c) => c.month === month);
  const closureMap = new Map<string, DailyMealClosure>();
  for (const c of monthClosures) {
    closureMap.set(c.date, c);
  }

  // 3. Build Daily Meal Summaries for each day in the month
  const dailyMealSummaries: PublicDailyMealSummary[] = [];
  const memberDailyMeals: Record<string, { count: number; type: MealStatus }> = {};

  for (let d = 1; d <= daysInMonth; d++) {
    const dayStr = String(d).padStart(2, '0');
    const dateStr = `${month}-${dayStr}`;
    const closure = closureMap.get(dateStr);
    const isFullOff = closure?.status === 'FULL_OFF';

    let dayTotalMeals = 0;
    let onCount = 0;
    let doubleCount = 0;
    let offCount = 0;

    const dayEntries = monthMeals.filter((m) => m.date === dateStr);
    for (const entry of dayEntries) {
      const count = isFullOff ? 0 : entry.count || 0;
      dayTotalMeals += count;

      if (entry.type === 'ON' || entry.count === 1) onCount++;
      else if (entry.type === 'Double' || entry.count === 2) doubleCount++;
      else if (entry.type === 'OFF' || entry.count === 0) offCount++;

      // Store in sanitized member map
      memberDailyMeals[`${entry.memberId}_${d}`] = {
        count,
        type: isFullOff ? 'OFF' : entry.type,
      };
    }

    dailyMealSummaries.push({
      date: dateStr,
      day: d,
      totalMeals: dayTotalMeals,
      status: closure?.status || 'NORMAL',
      closureReason: closure?.reason || '',
      onCount,
      doubleCount,
      offCount,
    });
  }

  // 4. Build Sanitized Market & Dining Expenses
  const monthExpenses = expenses
    .filter((e) => e.month === month)
    .sort((a, b) => b.date.localeCompare(a.date));

  let marketExpensesTotal = 0;
  let otherExpensesTotal = 0;

  const sanitizedExpenses: PublicExpenseItem[] = monthExpenses.map((exp) => {
    const isMarket =
      !exp.category ||
      exp.category.toLowerCase().includes('market') ||
      exp.category.toLowerCase().includes('bazaar') ||
      exp.category.toLowerCase().includes('grocery') ||
      exp.category.toLowerCase().includes('vegetable') ||
      exp.category.toLowerCase().includes('meat') ||
      exp.category.toLowerCase().includes('fish');

    if (isMarket) {
      marketExpensesTotal += exp.amount || 0;
    } else {
      otherExpensesTotal += exp.amount || 0;
    }

    return {
      id: exp.id,
      date: exp.date,
      title: exp.title,
      amount: exp.amount,
      category: exp.category || 'General Market',
      notes: exp.notes || '',
    };
  });

  // 5. Build Sanitized Member Summaries (NAME, ROOM, TOTAL MEALS ONLY - NO FINANCIAL BALANCES)
  const memberTotalMealsMap = new Map<string, number>();
  for (const s of memberSummaries) {
    memberTotalMealsMap.set(s.member.id, s.totalMeals);
  }

  const sanitizedMembers: PublicMemberInfo[] = members.map((m) => ({
    id: m.id,
    name: m.name,
    room: m.room,
    floor: m.floor || '',
    status: m.status,
    totalMeals: memberTotalMealsMap.get(m.id) || 0,
  }));

  // 6. Return PublicMonthData (Operational monthly data only, NO manager assignment duplication)
  return {
    month,
    summary: {
      month,
      totalMeals: overview.totalMeals,
      totalExpenses: overview.totalExpenses,
      marketExpensesTotal: marketExpensesTotal || overview.totalExpenses,
      otherExpensesTotal,
      mealRate: overview.mealRate,
      activeMembersCount: overview.activeMembers,
      totalMembersCount: overview.totalMembers,
      daysInMonth,
      fullOffDatesCount: overview.fullOffDatesCount,
    },
    dailyMealSummaries,
    expenses: sanitizedExpenses,
    members: sanitizedMembers,
    memberDailyMeals,
    publishedAt: Date.now(),
  };
}

/**
 * Builds the single authoritative public Manager Assignment Period Summary for /public_portal/meta.
 * Strictly limited to operational metrics:
 * - managerName
 * - assignmentDate
 * - status ('active' | 'resigned')
 * - resignationDate (only when applicable / resigned)
 * - totalMeals
 * - totalMarketExpenses
 * - mealRate
 * - managerFeePerMeal
 * - totalManagerFee
 */
export function buildPublicCurrentManagerSummary(
  managers: ManagerPeriod[],
  mealEntries: MealEntry[],
  expenses: Expense[],
  dailyClosures: DailyMealClosure[] = [],
  feeRatePerMeal: number = 5,
  referenceDate?: string
): PublicCurrentManagerSummary | null {
  if (!managers || managers.length === 0) return null;

  // Active manager takes priority; fallback to latest resigned manager
  const manager =
    managers.find((m) => m.status === 'Active') ||
    managers[managers.length - 1];

  if (!manager) return null;

  const calc = calculateManagerAssignmentPeriodAccounting(
    manager,
    mealEntries,
    expenses,
    dailyClosures,
    feeRatePerMeal,
    referenceDate
  );

  const isResigned = manager.status === 'Resigned' || (Boolean(manager.endDate) && manager.status !== 'Active');
  const status: 'active' | 'resigned' = isResigned ? 'resigned' : 'active';

  const summary: PublicCurrentManagerSummary = {
    managerName: calc.managerName,
    assignmentDate: calc.startDate,
    status,
    totalMeals: calc.totalMeals,
    totalMarketExpenses: calc.totalMarketExpenses,
    mealRate: calc.mealRate,
    managerFeePerMeal: calc.feeRatePerMeal,
    totalManagerFee: calc.totalManagerFee,
  };

  if (isResigned && manager.endDate) {
    summary.resignationDate = manager.endDate;
  }

  return summary;
}

/**
 * Publishes a single month's approved data to public_portal/{month}
 * Allowed only for authorized Admin UID by Firestore Security Rules.
 */
export async function publishMonthToPublicPortal(monthData: PublicMonthData): Promise<void> {
  if (!isFirebaseConfigured || !firestore) {
    throw new Error('Firebase is not configured.');
  }

  const monthDocRef = doc(firestore, PUBLIC_PORTAL_COLLECTION, monthData.month);
  const cleanData = removeUndefined(monthData);
  await setDoc(monthDocRef, cleanData, { merge: true });
}

/**
 * Publishes public portal metadata (mess branding, available months) to public_portal/meta
 */
export async function publishPublicPortalMeta(meta: PublicPortalMeta): Promise<void> {
  if (!isFirebaseConfigured || !firestore) {
    throw new Error('Firebase is not configured.');
  }

  const metaDocRef = doc(firestore, PUBLIC_PORTAL_COLLECTION, 'meta');
  const cleanMeta = removeUndefined(meta);
  await setDoc(metaDocRef, cleanMeta, { merge: true });
}

/**
 * Public unauthenticated read of public_portal/meta
 */
export async function fetchPublicPortalMeta(): Promise<PublicPortalMeta | null> {
  if (!isFirebaseConfigured || !firestore) return null;
  const metaDocRef = doc(firestore, PUBLIC_PORTAL_COLLECTION, 'meta');
  const snap = await getDoc(metaDocRef);
  return snap.exists() ? (snap.data() as PublicPortalMeta) : null;
}

/**
 * Public unauthenticated read of public_portal/{month}
 */
export async function fetchPublicMonthData(month: string): Promise<PublicMonthData | null> {
  if (!isFirebaseConfigured || !firestore) return null;
  const monthDocRef = doc(firestore, PUBLIC_PORTAL_COLLECTION, month);
  const snap = await getDoc(monthDocRef);
  return snap.exists() ? (snap.data() as PublicMonthData) : null;
}

/**
 * Real-time subscription to public_portal/{month} for public visitors
 */
export function subscribeToPublicMonth(
  month: string,
  onData: (data: PublicMonthData | null) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (!isFirebaseConfigured || !firestore) {
    onData(null);
    return () => {};
  }

  const monthDocRef = doc(firestore, PUBLIC_PORTAL_COLLECTION, month);
  return onSnapshot(
    monthDocRef,
    (snap) => {
      if (snap.exists()) {
        onData(snap.data() as PublicMonthData);
      } else {
        onData(null);
      }
    },
    (err) => {
      console.warn('Public portal month subscription error:', err);
      if (onError) onError(err);
    }
  );
}

/**
 * Real-time subscription to public_portal/meta for public visitors
 */
export function subscribeToPublicMeta(
  onData: (data: PublicPortalMeta | null) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (!isFirebaseConfigured || !firestore) {
    onData(null);
    return () => {};
  }

  const metaDocRef = doc(firestore, PUBLIC_PORTAL_COLLECTION, 'meta');
  return onSnapshot(
    metaDocRef,
    (snap) => {
      if (snap.exists()) {
        onData(snap.data() as PublicPortalMeta);
      } else {
        onData(null);
      }
    },
    (err) => {
      console.warn('Public portal meta subscription error:', err);
      if (onError) onError(err);
    }
  );
}
