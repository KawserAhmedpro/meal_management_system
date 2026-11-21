import { MealStatus } from './index';

export interface PublicManagerAssignmentSummary {
  managerName: string;
  startDate: string; // YYYY-MM-DD
  endDate?: string | null; // YYYY-MM-DD (null if active)
  status: 'Active' | 'Resigned';
  totalDays: number;
  totalMeals: number; // Meals counted from assignment start through today or resignation
  marketExpenses: number; // Market/bazaar expenses during assignment period
  mealRate: number; // marketExpenses / totalMeals (excludes manager fee)
  feeRatePerMeal: number; // Configured fee per meal (e.g. 5)
  managerFee: number; // Total running manager fee (displayed separately)
  isCurrentlyActive: boolean;
}

export interface PublicPortalMeta {
  messName: string;
  institutionName: string;
  hallName: string;
  currencySymbol: string;
  activeMonth: string; // e.g. "2026-03"
  availableMonths: string[]; // e.g. ["2026-03", "2026-02"]
  lastPublishedAt: number; // unix timestamp
  currentManager?: PublicManagerAssignmentSummary | null;
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
  managerAssignment?: PublicManagerAssignmentSummary | null;
}
