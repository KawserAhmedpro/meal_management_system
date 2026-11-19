import * as XLSX from 'xlsx';
import { Member, MealEntry, Expense, Deposit, SystemSettings } from '../types';
import { calculateMonthSummary } from './calculations';

export function exportMonthToExcel(
  month: string,
  members: Member[],
  mealEntries: MealEntry[],
  expenses: Expense[],
  deposits: Deposit[],
  settings: SystemSettings
) {
  const wb = XLSX.utils.book_new();

  const { overview, memberSummaries } = calculateMonthSummary(
    month,
    members,
    mealEntries,
    expenses,
    deposits,
    settings.managerFeePerMeal || 5
  );

  // Sheet 1: Monthly Summary
  const summaryData = [
    ['MEAL MANAGEMENT SYSTEM - MONTHLY FINANCIAL SUMMARY'],
    ['Institution:', settings.institutionName],
    ['Hall / Mess:', settings.hallName, settings.messName],
    ['Manager:', settings.managerName || 'Manager'],
    ['Month:', month],
    ['Generated On:', new Date().toLocaleString()],
    [],
    ['METRIC', 'VALUE'],
    ['Total Members', overview.totalMembers],
    ['Active Members', overview.activeMembers],
    ['Total Meals Consumed', overview.totalMeals],
    ['Total Market Expenses (৳)', overview.totalExpenses],
    ['Meal Rate (৳ / meal)', Number(overview.mealRate.toFixed(2))],
    ['Manager Fee Per Meal (৳)', settings.managerFeePerMeal || 5],
    ['Total Meal Expenses (Without fee) (৳)', overview.totalMealExpenses],
    ['Total Manager Fees (৳)', overview.totalManagerFees],
    ['Total Payable (৳)', overview.totalPayable],
    ['Total Deposits Collected (৳)', overview.totalDeposits],
    ['Total Outstanding Dues (৳)', overview.totalDue],
    ['Total Advance / Credit (৳)', overview.totalAdvance],
    ['Net Cash Balance (৳)', overview.netBalance],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

  // Sheet 2: Transactions / Member Financials
  const transHeaders = [
    'Room No',
    'Member Name',
    'Floor',
    'Total Meals',
    'Meal Expense (Without Fee)',
    'Manager Fee',
    'Total Payable',
    'Total Deposits',
    'Due / Advance',
    'Status',
  ];
  const transRows = memberSummaries.map((s) => [
    s.member.room,
    s.member.name,
    s.member.floor,
    s.totalMeals,
    s.mealExpenseWithoutFee,
    s.managerFee,
    s.totalPayable,
    s.totalDeposits,
    s.due,
    s.due > 0 ? 'DUE' : s.due < 0 ? 'ADVANCE' : 'SETTLED',
  ]);
  const wsTrans = XLSX.utils.aoa_to_sheet([transHeaders, ...transRows]);
  XLSX.utils.book_append_sheet(wb, wsTrans, 'Member Financials');

  // Sheet 3: Meals Grid (Day 1..31)
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const mealHeaders = ['Room No', 'Member Name'];
  for (let d = 1; d <= daysInMonth; d++) {
    mealHeaders.push(`Day ${d}`);
  }
  mealHeaders.push('Total Meals');

  const mealMap = new Map<string, number>();
  for (const entry of mealEntries) {
    if (entry.month === month) {
      const day = parseInt(entry.date.split('-')[2]);
      mealMap.set(`${entry.memberId}_${day}`, entry.count || 0);
    }
  }

  const mealRows = members.map((mem) => {
    const row: (string | number)[] = [mem.room, mem.name];
    let memberSum = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const cnt = mealMap.get(`${mem.id}_${d}`) || 0;
      row.push(cnt === 0 ? '' : cnt);
      memberSum += cnt;
    }
    row.push(memberSum);
    return row;
  });
  const wsMeals = XLSX.utils.aoa_to_sheet([mealHeaders, ...mealRows]);
  XLSX.utils.book_append_sheet(wb, wsMeals, 'Meals');

  // Sheet 4: Expenses (Costs)
  const expHeaders = ['Date', 'Category', 'Item Description', 'Cost (BDT ৳)', 'Notes'];
  const expRows = expenses
    .filter((e) => e.month === month)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => [e.date, e.category, e.title, e.amount, e.notes || '']);
  const wsExpenses = XLSX.utils.aoa_to_sheet([expHeaders, ...expRows]);
  XLSX.utils.book_append_sheet(wb, wsExpenses, 'Costs');

  // Sheet 5: Deposits
  const depHeaders = ['Date', 'Room No', 'Member Name', 'Payment Method', 'Amount (BDT ৳)', 'Notes'];
  const depRows = deposits
    .filter((d) => d.month === month)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => [d.date, d.room, d.memberName, d.paymentMethod || 'Cash', d.amount, d.note || '']);
  const wsDeposits = XLSX.utils.aoa_to_sheet([depHeaders, ...depRows]);
  XLSX.utils.book_append_sheet(wb, wsDeposits, 'Deposits');

  // Sheet 6: Members List
  const memHeaders = ['Member ID', 'Name', 'Room', 'Floor', 'Status', 'Phone', 'Joining Date', 'Notes'];
  const memRows = members.map((mem) => [
    mem.id,
    mem.name,
    mem.room,
    mem.floor,
    mem.status,
    mem.phone || '',
    mem.joiningDate,
    mem.notes || '',
  ]);
  const wsMembers = XLSX.utils.aoa_to_sheet([memHeaders, ...memRows]);
  XLSX.utils.book_append_sheet(wb, wsMembers, 'Members');

  // Write file
  XLSX.writeFile(wb, `MEAL_MANAGEMENT_${month}.xlsx`);
}
