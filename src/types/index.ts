export type MealStatus = 'ON' | 'Double' | 'OFF' | 'Blank';

export interface Member {
  id: string; // e.g. "MEM-001" or UUID
  name: string;
  room: string; // e.g. "ROOM-101"
  floor: string; // e.g. "1st Floor"
  joiningDate: string; // YYYY-MM-DD
  status: 'Active' | 'Inactive';
  phone?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface MealEntry {
  id: string; // `${memberId}_${date}`
  memberId: string;
  date: string; // YYYY-MM-DD
  month: string; // YYYY-MM
  type: MealStatus;
  count: number; // ON=1, Double=2, OFF=0, Blank=0
  note?: string;
  updatedAt: number;
}

export interface Expense {
  id: string;
  date: string; // YYYY-MM-DD
  month: string; // YYYY-MM
  title: string;
  amount: number;
  category: string;
  notes?: string;
  createdAt: number;
}

export interface Deposit {
  id: string;
  memberId: string;
  memberName: string;
  room: string;
  date: string; // YYYY-MM-DD
  month: string; // YYYY-MM
  amount: number;
  paymentMethod?: string;
  note?: string;
  createdAt: number;
}

export interface Category {
  id: string;
  name: string;
  isDefault?: boolean;
}

export interface ManagerPeriod {
  id: string; // e.g. "MGR-xxx"
  name: string; // e.g. "Ratul", "Sultan", "Robiul"
  phone?: string;
  startDate: string; // YYYY-MM-DD (inclusive)
  endDate?: string | null; // YYYY-MM-DD (inclusive, null or empty if currently active)
  status: 'Active' | 'Resigned';
  notes?: string;
  feeRateOverride?: number; // Optional custom rate if different from mess setting
  createdAt: number;
  updatedAt: number;
}

export interface DailyMealClosure {
  date: string; // YYYY-MM-DD (Primary Key)
  month: string; // YYYY-MM
  status: 'FULL_OFF' | 'FULL_ON';
  reason?: string; // e.g. "College Holiday", "Semester Break", "Ramadan", "Special Closure"
  updatedAt: number;
}

export interface SystemSettings {
  id: string; // "app_settings"
  managerName: string;
  messName: string;
  institutionName: string;
  hallName: string;
  currency: string;
  currencySymbol: string;
  managerFeePerMeal: number;
  theme: 'light' | 'dark';
  dateFormat: string;
  pinLockEnabled: boolean;
  pinCode?: string;
  selectedMonth: string; // YYYY-MM
  lastBackupDate?: string | null;
  reminderDays: number;
}

export interface ManagerAssignmentPeriodSummary {
  managerId: string;
  managerName: string;
  startDate: string; // YYYY-MM-DD (inclusive)
  endDate?: string | null; // YYYY-MM-DD (inclusive, null if active)
  effectiveEndDate: string; // YYYY-MM-DD (endDate or today's date if active)
  status: 'Active' | 'Resigned';
  isCurrentlyActive: boolean;
  totalDaysAssigned: number; // Inclusive calendar days count
  totalMeals: number; // Effective total meals during assignment period
  totalMarketExpenses: number; // Market & bazaar expenses during assignment period
  otherExpensesTotal: number; // General / utility expenses during assignment period
  totalPeriodExpenses: number; // Total dining expenses during assignment period
  mealRate: number; // totalMarketExpenses / totalMeals (0 if zero meals)
  feeRatePerMeal: number; // Configured fee per meal (e.g. 5)
  totalManagerFee: number; // totalMeals * feeRatePerMeal (separated from mealRate)
  fullOffDaysCount: number; // Days with FULL_OFF closure during period
  activeServingDaysCount: number; // Days with effective meals > 0
}

export interface ManagerFeeCalculation {
  manager: ManagerPeriod;
  activeStartDate: string;
  activeEndDate: string;
  activeDaysCount: number;
  mealsServed: number; // Actual meals during manager's active period (excluding FULL MEAL OFF dates)
  ratePerMeal: number;
  feeAmount: number;
}

export interface MemberFinancialSummary {
  member: Member;
  totalMeals: number; // Effective total meals (0 on FULL MEAL OFF dates)
  rawMealsCount: number; // Raw count before closure overrides
  mealExpenseWithoutFee: number;
  managerFee: number;
  totalPayable: number;
  totalDeposits: number;
  due: number; // positive = owes, negative = refund/advance
  depositsCount: number;
}

export interface MonthFinancialOverview {
  month: string;
  totalMembers: number;
  activeMembers: number;
  totalMeals: number; // Effective total meals
  totalExpenses: number;
  mealRate: number;
  totalDeposits: number;
  totalMealExpenses: number;
  totalManagerFees: number;
  totalPayable: number;
  totalDue: number; // sum of positive dues
  totalAdvance: number; // sum of negative dues (as positive value)
  netBalance: number; // totalDeposits - totalPayable
  fullOffDatesCount: number;
  managerCalculations: ManagerFeeCalculation[];
}
