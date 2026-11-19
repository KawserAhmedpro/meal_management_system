import {
  Member,
  MealEntry,
  Expense,
  Deposit,
  MemberFinancialSummary,
  MonthFinancialOverview,
  ManagerPeriod,
  DailyMealClosure,
  ManagerFeeCalculation,
} from '../types';

export function isDateFullOff(date: string, closures: DailyMealClosure[]): boolean {
  const closure = closures.find((c) => c.date === date);
  return closure?.status === 'FULL_OFF';
}

export function isManagerActiveOnDate(manager: ManagerPeriod, date: string): boolean {
  if (manager.startDate > date) return false;
  if (manager.endDate && manager.endDate < date) return false;
  return true;
}

export function calculateMonthSummary(
  month: string,
  members: Member[],
  mealEntries: MealEntry[],
  expenses: Expense[],
  deposits: Deposit[],
  defaultManagerFeeRate: number = 5,
  dailyClosures: DailyMealClosure[] = [],
  managers: ManagerPeriod[] = []
): {
  overview: MonthFinancialOverview;
  memberSummaries: MemberFinancialSummary[];
} {
  // Days in selected month
  const [yearStr, monthStr] = month.split('-');
  const year = parseInt(yearStr);
  const monthNum = parseInt(monthStr);
  const daysInMonth = new Date(year, monthNum, 0).getDate();

  // Filter for the month
  const monthMeals = mealEntries.filter((m) => m.month === month);
  const monthExpenses = expenses.filter((e) => e.month === month);
  const monthDeposits = deposits.filter((d) => d.month === month);
  const monthClosures = dailyClosures.filter((c) => c.month === month);

  // Set of dates that are FULL MEAL OFF
  const fullOffDateSet = new Set<string>();
  for (const c of monthClosures) {
    if (c.status === 'FULL_OFF') {
      fullOffDateSet.add(c.date);
    }
  }

  // Precompute daily meals per member and total daily meals
  // Key: `${memberId}_${date}` -> { rawCount, effectiveCount }
  const memberDailyMeals = new Map<string, { raw: number; effective: number }>();
  // Key: date -> total effective meals on that date
  const dateTotalEffectiveMeals = new Map<string, number>();

  for (let d = 1; d <= daysInMonth; d++) {
    const dayStr = String(d).padStart(2, '0');
    const dateStr = `${month}-${dayStr}`;
    dateTotalEffectiveMeals.set(dateStr, 0);
  }

  let totalMeals = 0;

  for (const entry of monthMeals) {
    const isOff = fullOffDateSet.has(entry.date);
    const raw = entry.count || 0;
    const effective = isOff ? 0 : raw;

    memberDailyMeals.set(`${entry.memberId}_${entry.date}`, { raw, effective });

    const curDayTotal = dateTotalEffectiveMeals.get(entry.date) || 0;
    dateTotalEffectiveMeals.set(entry.date, curDayTotal + effective);
    totalMeals += effective;
  }

  // Total expenses
  const totalExpenses = monthExpenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);

  // Meal rate (per meal cost)
  const mealRate = totalMeals > 0 ? totalExpenses / totalMeals : 0;

  // Option A: Manager Fee Calculation per Manager
  // Find which managers were active on which dates in this month
  const managerCalculations: ManagerFeeCalculation[] = [];
  let totalMessManagerFees = 0;

  // If no managers are configured in DB, fallback to virtual single manager
  const effectiveManagers: ManagerPeriod[] =
    managers.length > 0
      ? managers
      : [
          {
            id: 'MGR-DEFAULT',
            name: 'Mess Manager',
            startDate: `${month}-01`,
            endDate: null,
            status: 'Active',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ];

  for (const mgr of effectiveManagers) {
    let mealsServedForManager = 0;
    let activeDaysCount = 0;
    let earliestActiveInMonth = '';
    let latestActiveInMonth = '';

    const rate = mgr.feeRateOverride !== undefined ? mgr.feeRateOverride : defaultManagerFeeRate;

    for (let d = 1; d <= daysInMonth; d++) {
      const dayStr = String(d).padStart(2, '0');
      const dateStr = `${month}-${dayStr}`;

      if (isManagerActiveOnDate(mgr, dateStr)) {
        if (!earliestActiveInMonth) earliestActiveInMonth = dateStr;
        latestActiveInMonth = dateStr;
        activeDaysCount++;

        // Actual meals served on this day (if not FULL OFF)
        if (!fullOffDateSet.has(dateStr)) {
          mealsServedForManager += dateTotalEffectiveMeals.get(dateStr) || 0;
        }
      }
    }

    if (activeDaysCount > 0 || earliestActiveInMonth) {
      const feeAmount = Math.round(mealsServedForManager * rate * 100) / 100;
      totalMessManagerFees += feeAmount;

      managerCalculations.push({
        manager: mgr,
        activeStartDate: earliestActiveInMonth || mgr.startDate,
        activeEndDate: mgr.endDate || latestActiveInMonth || `${month}-${String(daysInMonth).padStart(2, '0')}`,
        activeDaysCount,
        mealsServed: mealsServedForManager,
        ratePerMeal: rate,
        feeAmount,
      });
    }
  }

  // Precompute deposits per member
  const memberDepositsMap = new Map<string, { total: number; count: number }>();
  for (const dep of monthDeposits) {
    const cur = memberDepositsMap.get(dep.memberId) || { total: 0, count: 0 };
    memberDepositsMap.set(dep.memberId, {
      total: cur.total + (dep.amount || 0),
      count: cur.count + 1,
    });
  }

  // Member summaries
  const memberSummaries: MemberFinancialSummary[] = members.map((member) => {
    let mEffectiveMeals = 0;
    let mRawMeals = 0;
    let mManagerFee = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const dayStr = String(d).padStart(2, '0');
      const dateStr = `${month}-${dayStr}`;
      const entryInfo = memberDailyMeals.get(`${member.id}_${dateStr}`) || { raw: 0, effective: 0 };

      mRawMeals += entryInfo.raw;
      mEffectiveMeals += entryInfo.effective;

      // Accrue manager fee for member on this date if a manager was active and day not FULL OFF
      if (entryInfo.effective > 0) {
        // Find active manager for dateStr
        const activeMgr = effectiveManagers.find((m) => isManagerActiveOnDate(m, dateStr));
        const rate =
          activeMgr?.feeRateOverride !== undefined
            ? activeMgr.feeRateOverride
            : defaultManagerFeeRate;
        mManagerFee += entryInfo.effective * rate;
      }
    }

    const mealExpenseWithoutFee = Math.round(mEffectiveMeals * mealRate * 100) / 100;
    const managerFee = Math.round(mManagerFee * 100) / 100;
    const totalPayable = Math.round((mealExpenseWithoutFee + managerFee) * 100) / 100;

    const depInfo = memberDepositsMap.get(member.id) || { total: 0, count: 0 };
    const totalDeposits = depInfo.total;
    const due = Math.round((totalPayable - totalDeposits) * 100) / 100;

    return {
      member,
      totalMeals: mEffectiveMeals,
      rawMealsCount: mRawMeals,
      mealExpenseWithoutFee,
      managerFee,
      totalPayable,
      totalDeposits,
      due,
      depositsCount: depInfo.count,
    };
  });

  // Totals across mess
  let totalMealExpenses = 0;
  let totalPayable = 0;
  let totalDeposits = 0;
  let totalDue = 0;
  let totalAdvance = 0;

  for (const summary of memberSummaries) {
    totalMealExpenses += summary.mealExpenseWithoutFee;
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
    totalManagerFees: totalMessManagerFees,
    totalPayable,
    totalDue,
    totalAdvance,
    netBalance: totalDeposits - totalPayable,
    fullOffDatesCount: fullOffDateSet.size,
    managerCalculations,
  };

  return { overview, memberSummaries };
}
