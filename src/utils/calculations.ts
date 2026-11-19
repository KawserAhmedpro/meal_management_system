import { Member, MealEntry, Expense, Deposit, MemberFinancialSummary, MonthFinancialOverview } from '../types';

export function calculateMonthSummary(
  month: string,
  members: Member[],
  mealEntries: MealEntry[],
  expenses: Expense[],
  deposits: Deposit[],
  managerFeePerMeal: number
): {
  overview: MonthFinancialOverview;
  memberSummaries: MemberFinancialSummary[];
} {
  // Filter for the month
  const monthMeals = mealEntries.filter((m) => m.month === month);
  const monthExpenses = expenses.filter((e) => e.month === month);
  const monthDeposits = deposits.filter((d) => d.month === month);

  // Total meals across all members
  const totalMeals = monthMeals.reduce((sum, entry) => sum + (entry.count || 0), 0);

  // Total expenses
  const totalExpenses = monthExpenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);

  // Meal rate (per meal cost)
  const mealRate = totalMeals > 0 ? totalExpenses / totalMeals : 0;

  // Meal entries mapped by memberId
  const memberMealCountMap = new Map<string, number>();
  for (const entry of monthMeals) {
    const cur = memberMealCountMap.get(entry.memberId) || 0;
    memberMealCountMap.set(entry.memberId, cur + (entry.count || 0));
  }

  // Deposits mapped by memberId
  const memberDepositsMap = new Map<string, { total: number; count: number }>();
  for (const dep of monthDeposits) {
    const cur = memberDepositsMap.get(dep.memberId) || { total: 0, count: 0 };
    memberDepositsMap.set(dep.memberId, {
      total: cur.total + (dep.amount || 0),
      count: cur.count + 1,
    });
  }

  const memberSummaries: MemberFinancialSummary[] = members.map((member) => {
    const mMeals = memberMealCountMap.get(member.id) || 0;
    const mealExpenseWithoutFee = Math.round(mMeals * mealRate * 100) / 100;
    const managerFee = mMeals * managerFeePerMeal;
    const totalPayable = mealExpenseWithoutFee + managerFee;
    
    const depInfo = memberDepositsMap.get(member.id) || { total: 0, count: 0 };
    const totalDeposits = depInfo.total;
    const due = Math.round((totalPayable - totalDeposits) * 100) / 100;

    return {
      member,
      totalMeals: mMeals,
      mealExpenseWithoutFee,
      managerFee,
      totalPayable,
      totalDeposits,
      due,
      depositsCount: depInfo.count,
    };
  });

  // Calculate totals across mess
  let totalMealExpenses = 0;
  let totalManagerFees = 0;
  let totalPayable = 0;
  let totalDeposits = 0;
  let totalDue = 0;
  let totalAdvance = 0;

  for (const summary of memberSummaries) {
    totalMealExpenses += summary.mealExpenseWithoutFee;
    totalManagerFees += summary.managerFee;
    totalPayable += summary.totalPayable;
    totalDeposits += summary.totalDeposits;

    if (summary.due > 0) {
      totalDue += summary.due;
    } else if (summary.due < 0) {
      totalAdvance += Math.abs(summary.due);
    }
  }

  const overview: MonthFinancialOverview = {
    month,
    totalMembers: members.length,
    activeMembers: members.filter((m) => m.status === 'Active').length,
    totalMeals,
    totalExpenses,
    mealRate,
    totalDeposits,
    totalMealExpenses,
    totalManagerFees,
    totalPayable,
    totalDue,
    totalAdvance,
    netBalance: totalDeposits - totalPayable,
  };

  return { overview, memberSummaries };
}
