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
  ManagerAssignmentPeriodSummary,
} from '../types';

export function isDateFullOff(date: string, closures: DailyMealClosure[]): boolean {
  const closure = closures.find((c) => !c._isDeleted && c.date === date);
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

  // Filter out soft-deleted records and scope to the month
  const activeMembersList = members.filter((m) => !m._isDeleted);
  const activeManagersList = managers.filter((m) => !m._isDeleted);
  const monthMeals = mealEntries.filter((m) => !m._isDeleted && m.month === month);
  const monthExpenses = expenses.filter((e) => !e._isDeleted && e.month === month);
  const monthDeposits = deposits.filter((d) => !d._isDeleted && d.month === month);
  const monthClosures = dailyClosures.filter((c) => !c._isDeleted && c.month === month);

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
    activeManagersList.length > 0
      ? activeManagersList
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
  const memberSummaries: MemberFinancialSummary[] = activeMembersList.map((member) => {
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
    totalMembers: activeMembersList.length,
    activeMembers: activeMembersList.filter((m) => m.status === 'Active').length,
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

// =============================================================================
// MANAGER ASSIGNMENT PERIOD ACCOUNTING (SEPARATE CALCULATION LAYER)
// =============================================================================

/**
 * Returns today's date formatted as YYYY-MM-DD in local time
 */
export function getTodayLocalDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Calculates the inclusive number of calendar days between two YYYY-MM-DD dates.
 */
export function getDaysBetweenInclusive(startDateStr: string, endDateStr: string): number {
  if (!startDateStr || !endDateStr || startDateStr > endDateStr) return 0;
  const [sY, sM, sD] = startDateStr.split('-').map(Number);
  const [eY, eM, eD] = endDateStr.split('-').map(Number);
  const startUtc = Date.UTC(sY, sM - 1, sD);
  const endUtc = Date.UTC(eY, eM - 1, eD);
  return Math.round((endUtc - startUtc) / (1000 * 60 * 60 * 24)) + 1;
}

/**
 * Determines whether an expense item represents raw market/bazaar food procurement
 * versus fixed utility / salary overhead.
 */
export function isMarketExpense(exp: { category?: string; title?: string }): boolean {
  const cat = (exp.category || '').toLowerCase().trim();
  const title = (exp.title || '').toLowerCase().trim();

  // Explicit non-market overhead items
  if (
    cat.includes('gas') ||
    cat.includes('cook') ||
    cat.includes('salary') ||
    cat.includes('wifi') ||
    cat.includes('internet') ||
    cat.includes('utility') ||
    cat.includes('clean') ||
    cat.includes('electric') ||
    cat.includes('waste') ||
    title.includes('cook salary') ||
    title.includes('wifi bill') ||
    title.includes('gas cylinder') ||
    title.includes('electric bill')
  ) {
    return false;
  }

  // If unassigned or generic category, treat as market unless title indicates overhead
  if (!cat || cat === 'other') {
    return true;
  }

  return (
    cat.includes('market') ||
    cat.includes('bazaar') ||
    cat.includes('grocery') ||
    cat.includes('vegetable') ||
    cat.includes('meat') ||
    cat.includes('fish') ||
    cat.includes('rice') ||
    cat.includes('egg') ||
    cat.includes('oil') ||
    cat.includes('spice') ||
    cat.includes('food') ||
    cat.includes('chicken') ||
    cat.includes('beef')
  );
}

/**
 * Calculates manager accounting based strictly on actual assignment period dates,
 * NOT calendar months. Handles active running periods and historical resigned periods.
 *
 * CRITICAL ACCOUNTING RULES:
 * 1. Meal Rate = Total Market Expenses / Total Effective Meals (Excludes manager fee).
 * 2. Manager Fee = Total Effective Meals * Fee Rate Per Meal (Separated from meal rate).
 * 3. OFF / FULL_OFF meals are excluded from effective meals.
 * 4. Zero meals are handled gracefully with mealRate = 0.
 */
export function calculateManagerAssignmentPeriodAccounting(
  manager: ManagerPeriod,
  mealEntries: MealEntry[],
  expenses: Expense[],
  dailyClosures: DailyMealClosure[] = [],
  defaultFeeRatePerMeal: number = 5,
  referenceDate?: string
): ManagerAssignmentPeriodSummary {
  const startDate = manager.startDate;
  const todayStr = referenceDate || getTodayLocalDate();

  const isCurrentlyActive = manager.status === 'Active' || !manager.endDate;
  const effectiveEndDate = isCurrentlyActive
    ? todayStr
    : (manager.endDate || todayStr);

  const totalDaysAssigned = getDaysBetweenInclusive(startDate, effectiveEndDate);

  // 1. Identify FULL_OFF dates within the manager's assignment window
  const fullOffDateSet = new Set<string>();
  for (const c of dailyClosures) {
    if (!c._isDeleted && c.status === 'FULL_OFF' && c.date >= startDate && c.date <= effectiveEndDate) {
      fullOffDateSet.add(c.date);
    }
  }

  // 2. Count effective meals within [startDate, effectiveEndDate] inclusive
  let totalMeals = 0;
  const activeServingDates = new Set<string>();

  for (const entry of mealEntries) {
    if (!entry._isDeleted && entry.date >= startDate && entry.date <= effectiveEndDate) {
      const isFullOff = fullOffDateSet.has(entry.date);
      const effectiveCount = isFullOff ? 0 : (entry.count || 0);
      totalMeals += effectiveCount;
      if (effectiveCount > 0) {
        activeServingDates.add(entry.date);
      }
    }
  }

  // 3. Count market expenses within [startDate, effectiveEndDate] inclusive (deduplicated)
  let totalMarketExpenses = 0;
  let otherExpensesTotal = 0;
  const seenExpenseIds = new Set<string>();

  for (const exp of expenses) {
    if (!exp._isDeleted && exp.date >= startDate && exp.date <= effectiveEndDate) {
      if (!seenExpenseIds.has(exp.id)) {
        seenExpenseIds.add(exp.id);
        const amount = exp.amount || 0;
        if (isMarketExpense(exp)) {
          totalMarketExpenses += amount;
        } else {
          otherExpensesTotal += amount;
        }
      }
    }
  }

  // 4. Meal Rate = Total Market Expenses / Total Effective Meals (CRITICAL: Manager fee NOT added)
  const mealRate = totalMeals > 0
    ? Math.round((totalMarketExpenses / totalMeals) * 100) / 100
    : 0;

  // 5. Manager Fee = Total Effective Meals * Fee Rate Per Meal
  const feeRatePerMeal = manager.feeRateOverride !== undefined
    ? manager.feeRateOverride
    : defaultFeeRatePerMeal;

  const totalManagerFee = Math.round(totalMeals * feeRatePerMeal * 100) / 100;

  return {
    managerId: manager.id,
    managerName: manager.name,
    startDate,
    endDate: manager.endDate || null,
    effectiveEndDate,
    status: isCurrentlyActive ? 'Active' : 'Resigned',
    isCurrentlyActive,
    totalDaysAssigned,
    totalMeals,
    totalMarketExpenses,
    otherExpensesTotal,
    totalPeriodExpenses: totalMarketExpenses + otherExpensesTotal,
    mealRate,
    feeRatePerMeal,
    totalManagerFee,
    fullOffDaysCount: fullOffDateSet.size,
    activeServingDaysCount: activeServingDates.size,
  };
}

/**
 * Computes assignment period accounting summaries for all registered managers.
 */
export function calculateAllManagerAssignmentPeriods(
  managers: ManagerPeriod[],
  mealEntries: MealEntry[],
  expenses: Expense[],
  dailyClosures: DailyMealClosure[] = [],
  defaultFeeRatePerMeal: number = 5,
  referenceDate?: string
): ManagerAssignmentPeriodSummary[] {
  const sorted = [...managers]
    .filter((m) => !m._isDeleted)
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
  return sorted.map((mgr) =>
    calculateManagerAssignmentPeriodAccounting(
      mgr,
      mealEntries,
      expenses,
      dailyClosures,
      defaultFeeRatePerMeal,
      referenceDate
    )
  );
}

export interface ManagerAssignmentDashboardOverview {
  managerSummary: ManagerAssignmentPeriodSummary;
  overview: MonthFinancialOverview;
  memberSummaries: MemberFinancialSummary[];
  periodMealEntries: MealEntry[];
  periodExpenses: Expense[];
  periodDeposits: Deposit[];
}

/**
 * Calculates complete Dashboard financial overview and metrics scoped strictly
 * to the selected manager's assignment period [startDate, effectiveEndDate] inclusive.
 */
export function calculateManagerAssignmentDashboardOverview(
  manager: ManagerPeriod,
  members: Member[],
  mealEntries: MealEntry[],
  expenses: Expense[],
  deposits: Deposit[],
  dailyClosures: DailyMealClosure[] = [],
  defaultFeeRatePerMeal: number = 5,
  referenceDate?: string
): ManagerAssignmentDashboardOverview {
  const managerSummary = calculateManagerAssignmentPeriodAccounting(
    manager,
    mealEntries,
    expenses,
    dailyClosures,
    defaultFeeRatePerMeal,
    referenceDate
  );

  const startDate = managerSummary.startDate;
  const effectiveEndDate = managerSummary.effectiveEndDate;
  const mealRate = managerSummary.mealRate;
  const feeRatePerMeal = managerSummary.feeRatePerMeal;

  const activeMembersList = members.filter((m) => !m._isDeleted);

  // 1. Identify FULL_OFF dates in this manager's assignment window
  const fullOffDateSet = new Set<string>();
  for (const c of dailyClosures) {
    if (!c._isDeleted && c.status === 'FULL_OFF' && c.date >= startDate && c.date <= effectiveEndDate) {
      fullOffDateSet.add(c.date);
    }
  }

  // 2. Filter period meal entries
  const periodMealEntries = mealEntries.filter(
    (m) => !m._isDeleted && m.date >= startDate && m.date <= effectiveEndDate
  );

  // 3. Filter period expenses (deduplicated by ID)
  const seenExpIds = new Set<string>();
  const periodExpenses: Expense[] = [];
  for (const exp of expenses) {
    if (!exp._isDeleted && exp.date >= startDate && exp.date <= effectiveEndDate) {
      if (!seenExpIds.has(exp.id)) {
        seenExpIds.add(exp.id);
        periodExpenses.push(exp);
      }
    }
  }

  // 4. Filter period deposits (deduplicated by ID)
  const seenDepIds = new Set<string>();
  const periodDeposits: Deposit[] = [];
  for (const dep of deposits) {
    if (!dep._isDeleted && dep.date >= startDate && dep.date <= effectiveEndDate) {
      if (!seenDepIds.has(dep.id)) {
        seenDepIds.add(dep.id);
        periodDeposits.push(dep);
      }
    }
  }

  // 5. Precompute deposits per member in this assignment period
  const memberDepositsMap = new Map<string, { total: number; count: number }>();
  for (const dep of periodDeposits) {
    const cur = memberDepositsMap.get(dep.memberId) || { total: 0, count: 0 };
    memberDepositsMap.set(dep.memberId, {
      total: cur.total + (dep.amount || 0),
      count: cur.count + 1,
    });
  }

  // 6. Precompute effective meals per member in this assignment period
  const memberMealsMap = new Map<string, { raw: number; effective: number }>();
  for (const entry of periodMealEntries) {
    const isFullOff = fullOffDateSet.has(entry.date);
    const cur = memberMealsMap.get(entry.memberId) || { raw: 0, effective: 0 };
    const raw = entry.count || 0;
    const effective = isFullOff ? 0 : raw;
    memberMealsMap.set(entry.memberId, {
      raw: cur.raw + raw,
      effective: cur.effective + effective,
    });
  }

  // 7. Calculate member-level financial summaries for this manager period
  const memberSummaries: MemberFinancialSummary[] = activeMembersList.map((member) => {
    const mealInfo = memberMealsMap.get(member.id) || { raw: 0, effective: 0 };
    const mEffectiveMeals = mealInfo.effective;
    const mRawMeals = mealInfo.raw;

    const mealExpenseWithoutFee = Math.round(mEffectiveMeals * mealRate * 100) / 100;
    const managerFee = Math.round(mEffectiveMeals * feeRatePerMeal * 100) / 100;
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

  // 8. Aggregate mess totals
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
    month: `${startDate} to ${effectiveEndDate}`,
    totalMembers: activeMembersList.length,
    activeMembers: activeMembersList.filter((m) => m.status === 'Active').length,
    totalMeals: managerSummary.totalMeals,
    totalExpenses: managerSummary.totalMarketExpenses,
    mealRate: managerSummary.mealRate,
    totalDeposits,
    totalMealExpenses: Math.round(totalMealExpenses * 100) / 100,
    totalManagerFees: managerSummary.totalManagerFee,
    totalPayable: Math.round(totalPayable * 100) / 100,
    totalDue: Math.round(totalDue * 100) / 100,
    totalAdvance: Math.round(totalAdvance * 100) / 100,
    netBalance: Math.round((totalDeposits - totalPayable) * 100) / 100,
    fullOffDatesCount: fullOffDateSet.size,
    managerCalculations: [
      {
        manager,
        activeStartDate: startDate,
        activeEndDate: effectiveEndDate,
        activeDaysCount: managerSummary.totalDaysAssigned,
        mealsServed: managerSummary.totalMeals,
        ratePerMeal: feeRatePerMeal,
        feeAmount: managerSummary.totalManagerFee,
      },
    ],
  };

  return {
    managerSummary,
    overview,
    memberSummaries,
    periodMealEntries,
    periodExpenses,
    periodDeposits,
  };
}
