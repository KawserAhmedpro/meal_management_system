import { MealStatus } from './index';

/**
 * Authoritative single public Manager Assignment Period Summary in /public_portal/meta.
 * Strictly limited to operational metadata without personal or private member info.
 */
export interface PublicCurrentManagerSummary {
  id?: string;
  managerName: string;
  assignmentDate: string; // YYYY-MM-DD
  status: 'active' | 'resigned';
  resignationDate?: string | null; // YYYY-MM-DD (present only when resigned)
  totalMeals: number; // Meals counted from assignmentDate through today (active) or resignationDate (resigned)
  totalMarketExpenses: number; // Bazaar purchases during assignment period
  mealRate: number; // totalMarketExpenses / totalMeals (excludes manager fee)
  managerFeePerMeal: number; // Configured fee per meal (e.g. 5)
  totalManagerFee: number; // Total manager fee (displayed separately from meal rate)
}

// Backward compatibility alias if needed
export type PublicManagerAssignmentSummary = PublicCurrentManagerSummary;

export interface PublicPortalMeta {
  messName: string;
  institutionName: string;
  hallName: string;
  currencySymbol: string;
  activeMonth: string; // e.g. "2026-03"
  availableMonths: string[]; // e.g. ["2026-03", "2026-02"]
  lastPublishedAt: number; // unix timestamp
  currentManager?: PublicCurrentManagerSummary | null;
  availableManagers?: PublicCurrentManagerSummary[];
}

export interface PublicMemberInfo {
  id: string; // e.g. "MEM-001"
  name: string;
  room: string;
  floor: string;
  status: 'Active' | 'Inactive';
  totalMeals: number; // monthly total meals for this member
}

export interface PublicExpenseItem {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  amount: number;
  category: string;
  notes?: string;
}

export interface PublicDailyMealSummary {
  date: string; // YYYY-MM-DD
  day: number; // 1-31
  totalMeals: number; // Effective total meals for the mess on this day
  status: 'NORMAL' | 'FULL_OFF' | 'FULL_ON';
  closureReason?: string;
  onCount: number; // number of members with meal ON (count = 1)
  doubleCount: number; // number of members with meal Double (count = 2)
  offCount: number; // number of members with meal OFF (count = 0)
}

export interface PublicMonthSummary {
  month: string; // YYYY-MM
  totalMeals: number;
  totalExpenses: number;
  marketExpensesTotal: number;
  otherExpensesTotal: number;
  mealRate: number; // totalExpenses / totalMeals
  activeMembersCount: number;
  totalMembersCount: number;
  daysInMonth: number;
  fullOffDatesCount: number;
}

export interface PublicMonthData {
  month: string; // e.g. "2026-03"
  summary: PublicMonthSummary;
  dailyMealSummaries: PublicDailyMealSummary[];
  expenses: PublicExpenseItem[];
  members: PublicMemberInfo[];
  // Mapping of `${memberId}_${day}` -> { count: number, type: MealStatus }
  memberDailyMeals: Record<string, { count: number; type: MealStatus }>;
  publishedAt: number;
}
