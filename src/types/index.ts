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

export interface MemberFinancialSummary {
  member: Member;
  totalMeals: number;
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
  totalMeals: number;
  totalExpenses: number;
  mealRate: number;
  totalDeposits: number;
  totalMealExpenses: number;
  totalManagerFees: number;
  totalPayable: number;
  totalDue: number; // sum of positive dues
  totalAdvance: number; // sum of negative dues (as positive value)
  netBalance: number; // totalDeposits - totalPayable
}
