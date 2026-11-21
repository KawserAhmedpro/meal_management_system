import {
  calculateManagerAssignmentPeriodAccounting,
  calculateAllManagerAssignmentPeriods,
  getDaysBetweenInclusive,
  isMarketExpense,
  getTodayLocalDate
} from './src/utils/calculations.ts';
import {
  buildPublicCurrentManagerSummary,
  sanitizeAndBuildPublicData
} from './src/services/publicPortal.ts';

console.log('========================================================================');
console.log('MANAGER ASSIGNMENT PERIOD ACCOUNTING TEST SUITE (13 SCENARIOS)');
console.log('========================================================================\n');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

// -----------------------------------------------------------------------------
// Test 1: Assignment and resignation within the same month
// -----------------------------------------------------------------------------
console.log('Test 1: Assignment and resignation within same month');
{
  const manager = {
    id: 'MGR-1',
    name: 'SameMonth Manager',
    startDate: '2026-03-01',
    endDate: '2026-03-15',
    status: 'Resigned',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const meals = [
    { id: 'm1', memberId: 'mem1', date: '2026-03-05', month: '2026-03', count: 2, type: 'Double', updatedAt: Date.now() },
    { id: 'm2', memberId: 'mem2', date: '2026-03-10', month: '2026-03', count: 1, type: 'ON', updatedAt: Date.now() },
    { id: 'm3', memberId: 'mem1', date: '2026-03-20', month: '2026-03', count: 2, type: 'Double', updatedAt: Date.now() }, // Outside period!
  ];

  const expenses = [
    { id: 'e1', date: '2026-03-05', month: '2026-03', title: 'Fish & Veg', amount: 300, category: 'Market', createdAt: Date.now() },
    { id: 'e2', date: '2026-03-22', month: '2026-03', title: 'Meat', amount: 500, category: 'Market', createdAt: Date.now() }, // Outside period!
  ];

  const summary = calculateManagerAssignmentPeriodAccounting(manager, meals, expenses, [], 5);

  assert(summary.totalDaysAssigned === 15, 'Total days assigned = 15 days (March 1 to 15 inclusive)');
  assert(summary.totalMeals === 3, 'Total meals = 3 (m1=2 + m2=1, m3 excluded)');
  assert(summary.totalMarketExpenses === 300, 'Market expenses = 300 (e1=300, e2 excluded)');
  assert(summary.mealRate === 100, 'Meal rate = 300 / 3 = 100 BDT/meal');
  assert(summary.totalManagerFee === 15, 'Manager fee = 3 * 5 = 15 BDT (separate from meal rate)');
  assert(summary.isCurrentlyActive === false, 'isCurrentlyActive is false');
}

// -----------------------------------------------------------------------------
// Test 2: Assignment in November and resignation in December (cross-month)
// -----------------------------------------------------------------------------
console.log('\nTest 2: Assignment across month boundary (Nov 21 to Dec 25)');
{
  const manager = {
    id: 'MGR-CROSS',
    name: 'CrossMonth Manager',
    startDate: '2026-11-21',
    endDate: '2026-12-25',
    status: 'Resigned',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const meals = [
    { id: 'm0', memberId: 'mem1', date: '2026-11-20', month: '2026-11', count: 2, type: 'Double', updatedAt: Date.now() }, // Excluded (before start)
    { id: 'm1', memberId: 'mem1', date: '2026-11-21', month: '2026-11', count: 2, type: 'Double', updatedAt: Date.now() }, // Included (start date)
    { id: 'm2', memberId: 'mem2', date: '2026-11-30', month: '2026-11', count: 1, type: 'ON', updatedAt: Date.now() },     // Included
    { id: 'm3', memberId: 'mem1', date: '2026-12-01', month: '2026-12', count: 2, type: 'Double', updatedAt: Date.now() }, // Included
    { id: 'm4', memberId: 'mem2', date: '2026-12-25', month: '2026-12', count: 1, type: 'ON', updatedAt: Date.now() },     // Included (end date)
    { id: 'm5', memberId: 'mem1', date: '2026-12-26', month: '2026-12', count: 2, type: 'Double', updatedAt: Date.now() }, // Excluded (after end)
  ];

  const expenses = [
    { id: 'e0', date: '2026-11-20', month: '2026-11', title: 'Early Bazaar', amount: 1000, category: 'Market', createdAt: Date.now() }, // Excluded
    { id: 'e1', date: '2026-11-21', month: '2026-11', title: 'Day 1 Bazaar', amount: 4000, category: 'Market', createdAt: Date.now() },  // Included
    { id: 'e2', date: '2026-12-10', month: '2026-12', title: 'Mid Bazaar', amount: 6000, category: 'Market', createdAt: Date.now() },    // Included
    { id: 'e3', date: '2026-12-26', month: '2026-12', title: 'Late Bazaar', amount: 2000, category: 'Market', createdAt: Date.now() },   // Excluded
  ];

  const summary = calculateManagerAssignmentPeriodAccounting(manager, meals, expenses, [], 5);

  assert(summary.totalDaysAssigned === 35, 'Total days assigned = 35 days (10 in Nov + 25 in Dec inclusive)');
  assert(summary.totalMeals === 6, 'Total meals = 6 (m1=2, m2=1, m3=2, m4=1)');
  assert(summary.totalMarketExpenses === 10000, 'Total market expenses = 10,000 BDT (4000 + 6000)');
  assert(Math.round(summary.mealRate * 100) / 100 === 1666.67, 'Meal rate = 10,000 / 6 = 1666.67 BDT');
  assert(summary.totalManagerFee === 30, 'Manager fee = 6 * 5 = 30 BDT');
}

// -----------------------------------------------------------------------------
// Test 3: Active manager running calculation through today
// -----------------------------------------------------------------------------
console.log('\nTest 3: Active manager live running calculation through today');
{
  const manager = {
    id: 'MGR-ACTIVE',
    name: 'Active Ratul',
    startDate: '2026-11-01',
    endDate: null,
    status: 'Active',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const mockToday = '2026-11-21';

  const meals = [
    { id: 'm1', memberId: 'mem1', date: '2026-11-05', month: '2026-11', count: 2, type: 'Double', updatedAt: Date.now() },
    { id: 'm2', memberId: 'mem2', date: '2026-11-21', month: '2026-11', count: 1, type: 'ON', updatedAt: Date.now() },
    { id: 'm3', memberId: 'mem1', date: '2026-11-25', month: '2026-11', count: 2, type: 'Double', updatedAt: Date.now() }, // Future relative to mockToday
  ];

  const expenses = [
    { id: 'e1', date: '2026-11-05', month: '2026-11', title: 'Market 1', amount: 1500, category: 'Market', createdAt: Date.now() },
    { id: 'e2', date: '2026-11-21', month: '2026-11', title: 'Market 2', amount: 1000, category: 'Market', createdAt: Date.now() },
    { id: 'e3', date: '2026-11-25', month: '2026-11', title: 'Market 3', amount: 500, category: 'Market', createdAt: Date.now() }, // Future
  ];

  const summary = calculateManagerAssignmentPeriodAccounting(manager, meals, expenses, [], 5, mockToday);

  assert(summary.isCurrentlyActive === true, 'isCurrentlyActive is true');
  assert(summary.effectiveEndDate === '2026-11-21', 'effectiveEndDate matches today');
  assert(summary.totalDaysAssigned === 21, 'Total days assigned through today = 21 days');
  assert(summary.totalMeals === 3, 'Total meals through today = 3 (future meal m3 excluded)');
  assert(summary.totalMarketExpenses === 2500, 'Market expenses through today = 2500 (future expense e3 excluded)');
}

// -----------------------------------------------------------------------------
// Test 4: Resigned manager final calculation (frozen)
// -----------------------------------------------------------------------------
console.log('\nTest 4: Resigned manager final frozen calculation');
{
  const manager = {
    id: 'MGR-RESIGNED',
    name: 'Historical Sultan',
    startDate: '2026-02-01',
    endDate: '2026-02-28',
    status: 'Resigned',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const meals = [
    { id: 'm1', memberId: 'mem1', date: '2026-02-15', month: '2026-02', count: 200, type: 'Double', updatedAt: Date.now() },
    { id: 'm2', memberId: 'mem2', date: '2026-03-01', month: '2026-03', count: 100, type: 'ON', updatedAt: Date.now() }, // After resignation
  ];

  const expenses = [
    { id: 'e1', date: '2026-02-15', month: '2026-02', title: 'Bazaar', amount: 8000, category: 'Market', createdAt: Date.now() },
    { id: 'e2', date: '2026-03-01', month: '2026-03', title: 'Bazaar', amount: 5000, category: 'Market', createdAt: Date.now() }, // After resignation
  ];

  // Even if evaluated today (November), resignation period stays frozen in Feb
  const summary = calculateManagerAssignmentPeriodAccounting(manager, meals, expenses, [], 5, '2026-11-21');

  assert(summary.isCurrentlyActive === false, 'isCurrentlyActive is false');
  assert(summary.effectiveEndDate === '2026-02-28', 'effectiveEndDate frozen at endDate');
  assert(summary.totalDaysAssigned === 28, 'Total days = 28');
  assert(summary.totalMeals === 200, 'Total meals = 200 (post-resignation meals excluded)');
  assert(summary.totalMarketExpenses === 8000, 'Market expenses = 8000 (post-resignation expenses excluded)');
  assert(summary.mealRate === 40, 'Meal rate = 8000 / 200 = 40 BDT');
}

// -----------------------------------------------------------------------------
// Test 5 & 6: Meal & expense counting across month boundaries
// -----------------------------------------------------------------------------
console.log('\nTest 5 & 6: Month boundary integrity for meals and expenses');
{
  const manager = {
    id: 'MGR-OCT-NOV',
    name: 'Oct-Nov Manager',
    startDate: '2026-10-25',
    endDate: '2026-11-10',
    status: 'Resigned',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  // October meals & expenses
  const meals = [
    { id: 'm1', memberId: 'mem1', date: '2026-10-25', month: '2026-10', count: 10, type: 'ON', updatedAt: Date.now() },
    { id: 'm2', memberId: 'mem1', date: '2026-10-31', month: '2026-10', count: 10, type: 'ON', updatedAt: Date.now() },
    { id: 'm3', memberId: 'mem1', date: '2026-11-01', month: '2026-11', count: 15, type: 'ON', updatedAt: Date.now() },
    { id: 'm4', memberId: 'mem1', date: '2026-11-10', month: '2026-11', count: 15, type: 'ON', updatedAt: Date.now() },
  ];

  const expenses = [
    { id: 'e1', date: '2026-10-25', month: '2026-10', title: 'Oct Meat', amount: 1000, category: 'Meat', createdAt: Date.now() },
    { id: 'e2', date: '2026-11-01', month: '2026-11', title: 'Nov Fish', amount: 1500, category: 'Fish', createdAt: Date.now() },
  ];

  const summary = calculateManagerAssignmentPeriodAccounting(manager, meals, expenses, [], 5);

  assert(summary.totalMeals === 50, 'Total meals across boundary = 10 + 10 + 15 + 15 = 50');
  assert(summary.totalMarketExpenses === 2500, 'Total market expenses across boundary = 1000 + 1500 = 2500');
  assert(summary.mealRate === 50, 'Meal rate = 2500 / 50 = 50 BDT');
}

// -----------------------------------------------------------------------------
// Test 7: OFF and FULL_OFF exclusion
// -----------------------------------------------------------------------------
console.log('\nTest 7: OFF and FULL_OFF exclusion from effective meal totals');
{
  const manager = {
    id: 'MGR-CLOSURE',
    name: 'Closure Test Manager',
    startDate: '2026-05-01',
    endDate: '2026-05-05',
    status: 'Resigned',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const meals = [
    { id: 'm1', memberId: 'mem1', date: '2026-05-01', month: '2026-05', count: 1, type: 'ON', updatedAt: Date.now() }, // 1
    { id: 'm2', memberId: 'mem2', date: '2026-05-01', month: '2026-05', count: 0, type: 'OFF', updatedAt: Date.now() }, // OFF=0
    { id: 'm3', memberId: 'mem1', date: '2026-05-02', month: '2026-05', count: 2, type: 'Double', updatedAt: Date.now() }, // On closure day!
    { id: 'm4', memberId: 'mem2', date: '2026-05-02', month: '2026-05', count: 1, type: 'ON', updatedAt: Date.now() }, // On closure day!
    { id: 'm5', memberId: 'mem1', date: '2026-05-03', month: '2026-05', count: 2, type: 'Double', updatedAt: Date.now() }, // 2
  ];

  const closures = [
    { date: '2026-05-02', month: '2026-05', status: 'FULL_OFF', reason: 'College Closed', updatedAt: Date.now() },
  ];

  const expenses = [
    { id: 'e1', date: '2026-05-01', month: '2026-05', title: 'Market', amount: 300, category: 'Market', createdAt: Date.now() },
  ];

  const summary = calculateManagerAssignmentPeriodAccounting(manager, meals, expenses, closures, 5);

  assert(summary.totalMeals === 3, 'Total effective meals = 3 (Day 1 m1=1, Day 2 FULL_OFF overrides to 0, Day 3 m5=2)');
  assert(summary.fullOffDaysCount === 1, 'fullOffDaysCount = 1');
  assert(summary.mealRate === 100, 'Meal rate = 300 / 3 = 100 BDT');
}

// -----------------------------------------------------------------------------
// Test 8 & 9: Manager Fee configuration changes & Separation from Meal Rate
// -----------------------------------------------------------------------------
console.log('\nTest 8 & 9: Configurable Manager Fee & Strict Separation from Meal Rate');
{
  const managerDefault = {
    id: 'MGR-FEE-DEF',
    name: 'Default Fee Manager',
    startDate: '2026-06-01',
    endDate: '2026-06-10',
    status: 'Resigned',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const managerOverride = {
    id: 'MGR-FEE-OVER',
    name: 'Custom Fee Manager',
    startDate: '2026-06-01',
    endDate: '2026-06-10',
    feeRateOverride: 8,
    status: 'Resigned',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const meals = [
    { id: 'm1', memberId: 'mem1', date: '2026-06-05', month: '2026-06', count: 100, type: 'Double', updatedAt: Date.now() },
  ];

  const expenses = [
    { id: 'e1', date: '2026-06-05', month: '2026-06', title: 'Market', amount: 2000, category: 'Market', createdAt: Date.now() },
  ];

  const sumDef = calculateManagerAssignmentPeriodAccounting(managerDefault, meals, expenses, [], 5);
  const sumOver = calculateManagerAssignmentPeriodAccounting(managerOverride, meals, expenses, [], 5);

  // Both must have the SAME meal rate (2000 / 100 = 20 BDT)
  assert(sumDef.mealRate === 20, 'Default manager meal rate = 20 BDT (market / meals)');
  assert(sumOver.mealRate === 20, 'Override manager meal rate = 20 BDT (market / meals)');
  assert(sumDef.totalManagerFee === 500, 'Default manager fee = 100 * 5 = 500 BDT');
  assert(sumOver.totalManagerFee === 800, 'Override manager fee = 100 * 8 = 800 BDT');
  assert(sumDef.mealRate === sumOver.mealRate, 'Manager fee rate change DOES NOT alter Meal Rate');
}

// -----------------------------------------------------------------------------
// Test 10: Multiple historical manager assignments (separate periods)
// -----------------------------------------------------------------------------
console.log('\nTest 10: Multiple historical managers with independent accounting');
{
  const mgrA = {
    id: 'MGR-A',
    name: 'Manager A',
    startDate: '2026-07-01',
    endDate: '2026-07-15',
    status: 'Resigned',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const mgrB = {
    id: 'MGR-B',
    name: 'Manager B',
    startDate: '2026-07-16',
    endDate: '2026-07-31',
    status: 'Resigned',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const meals = [
    { id: 'm1', memberId: 'mem1', date: '2026-07-05', month: '2026-07', count: 50, type: 'ON', updatedAt: Date.now() }, // Period A
    { id: 'm2', memberId: 'mem1', date: '2026-07-20', month: '2026-07', count: 80, type: 'ON', updatedAt: Date.now() }, // Period B
  ];

  const expenses = [
    { id: 'e1', date: '2026-07-05', month: '2026-07', title: 'A Market', amount: 1500, category: 'Market', createdAt: Date.now() }, // Period A
    { id: 'e2', date: '2026-07-20', month: '2026-07', title: 'B Market', amount: 3200, category: 'Market', createdAt: Date.now() }, // Period B
  ];

  const allSummaries = calculateAllManagerAssignmentPeriods([mgrA, mgrB], meals, expenses, [], 5);

  const sumA = allSummaries.find(s => s.managerId === 'MGR-A');
  const sumB = allSummaries.find(s => s.managerId === 'MGR-B');

  assert(sumA.totalMeals === 50, 'Manager A meals = 50');
  assert(sumA.totalMarketExpenses === 1500, 'Manager A expenses = 1500');
  assert(sumA.mealRate === 30, 'Manager A meal rate = 30 BDT');
  assert(sumB.totalMeals === 80, 'Manager B meals = 80');
  assert(sumB.totalMarketExpenses === 3200, 'Manager B expenses = 3200');
  assert(sumB.mealRate === 40, 'Manager B meal rate = 40 BDT');
  assert(sumA.mealRate !== sumB.mealRate, 'Independent meal rates preserved per manager period');
}

// -----------------------------------------------------------------------------
// Test 11: Zero-meal periods (division-by-zero prevention)
// -----------------------------------------------------------------------------
console.log('\nTest 11: Zero-meal period safety');
{
  const manager = {
    id: 'MGR-ZERO',
    name: 'Zero Meals Manager',
    startDate: '2026-08-01',
    endDate: '2026-08-05',
    status: 'Resigned',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const expenses = [
    { id: 'e1', date: '2026-08-02', month: '2026-08', title: 'Preparation Market', amount: 1000, category: 'Market', createdAt: Date.now() },
  ];

  const summary = calculateManagerAssignmentPeriodAccounting(manager, [], expenses, [], 5);

  assert(summary.totalMeals === 0, 'Total meals = 0');
  assert(summary.mealRate === 0, 'mealRate is 0 (safe, not NaN or Infinity)');
  assert(!Number.isNaN(summary.mealRate), 'mealRate is not NaN');
  assert(Number.isFinite(summary.mealRate), 'mealRate is finite');
  assert(summary.totalManagerFee === 0, 'Manager fee = 0');
}

// -----------------------------------------------------------------------------
// Test 12: No duplicate expenses or meals
// -----------------------------------------------------------------------------
console.log('\nTest 12: Deduplication of identical expense IDs');
{
  const manager = {
    id: 'MGR-DEDUP',
    name: 'Dedup Manager',
    startDate: '2026-09-01',
    endDate: '2026-09-10',
    status: 'Resigned',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const duplicateExpenses = [
    { id: 'e1', date: '2026-09-02', month: '2026-09', title: 'Rice', amount: 1000, category: 'Rice', createdAt: Date.now() },
    { id: 'e1', date: '2026-09-02', month: '2026-09', title: 'Rice (dupe copy)', amount: 1000, category: 'Rice', createdAt: Date.now() },
  ];

  const meals = [
    { id: 'm1', memberId: 'mem1', date: '2026-09-02', month: '2026-09', count: 20, type: 'Double', updatedAt: Date.now() },
  ];

  const summary = calculateManagerAssignmentPeriodAccounting(manager, meals, duplicateExpenses, [], 5);

  assert(summary.totalMarketExpenses === 1000, 'Duplicate expense e1 counted only once (1000 BDT, not 2000)');
  assert(summary.mealRate === 50, 'Meal rate = 1000 / 20 = 50 BDT');
}

// -----------------------------------------------------------------------------
// Test 13: Minimal Public Portal Architecture & Strict Single-Location Summary
// -----------------------------------------------------------------------------
console.log('\nTest 13: Minimal Public Portal Architecture & Strict Single-Location Summary');
{
  const activeMgr = {
    id: 'MGR-ACTIVE',
    name: 'Active Ratul',
    startDate: '2026-11-21',
    endDate: null,
    status: 'Active',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const resignedMgr = {
    id: 'MGR-RESIGNED',
    name: 'Resigned Sultan',
    startDate: '2026-10-01',
    endDate: '2026-11-20',
    status: 'Resigned',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const meals = [
    { id: 'm1', memberId: 'mem1', date: '2026-11-21', month: '2026-11', count: 500, type: 'Double', updatedAt: Date.now() },
    { id: 'm2', memberId: 'mem1', date: '2026-10-15', month: '2026-10', count: 800, type: 'Double', updatedAt: Date.now() },
  ];

  const expenses = [
    { id: 'e1', date: '2026-11-21', month: '2026-11', title: 'Bazaar', amount: 10000, category: 'Market', createdAt: Date.now() },
    { id: 'e2', date: '2026-10-15', month: '2026-10', title: 'Bazaar', amount: 16000, category: 'Market', createdAt: Date.now() },
  ];

  // 1. Active Manager Summary for /public_portal/meta
  const activeSummary = buildPublicCurrentManagerSummary([activeMgr], meals, expenses, [], 5, '2026-11-21');
  assert(activeSummary !== null, 'Active summary generated');
  assert(activeSummary.managerName === 'Active Ratul', 'Active managerName matches');
  assert(activeSummary.assignmentDate === '2026-11-21', 'Active assignmentDate matches');
  assert(activeSummary.status === 'active', 'Active status is "active"');
  assert(activeSummary.resignationDate === undefined, 'Active manager has NO resignationDate');
  assert(activeSummary.totalMeals === 500, 'Active totalMeals = 500');
  assert(activeSummary.totalMarketExpenses === 10000, 'Active totalMarketExpenses = 10,000 BDT');
  assert(activeSummary.mealRate === 20, 'Active mealRate = 20 BDT');
  assert(activeSummary.managerFeePerMeal === 5, 'Active managerFeePerMeal = 5');
  assert(activeSummary.totalManagerFee === 2500, 'Active totalManagerFee = 2,500 BDT');
  assert(!('deposits' in activeSummary), 'No deposits key in active summary');
  assert(!('phone' in activeSummary), 'No phone key in active summary');

  // 2. Resigned Manager Summary for /public_portal/meta
  const resignedSummary = buildPublicCurrentManagerSummary([resignedMgr], meals, expenses, [], 5);
  assert(resignedSummary !== null, 'Resigned summary generated');
  assert(resignedSummary.managerName === 'Resigned Sultan', 'Resigned managerName matches');
  assert(resignedSummary.assignmentDate === '2026-10-01', 'Resigned assignmentDate matches');
  assert(resignedSummary.status === 'resigned', 'Resigned status is "resigned"');
  assert(resignedSummary.resignationDate === '2026-11-20', 'Resigned resignationDate is "2026-11-20"');
  assert(resignedSummary.totalMeals === 800, 'Resigned totalMeals = 800');
  assert(resignedSummary.totalMarketExpenses === 16000, 'Resigned totalMarketExpenses = 16,000 BDT');
  assert(resignedSummary.mealRate === 20, 'Resigned mealRate = 20 BDT');
  assert(resignedSummary.totalManagerFee === 4000, 'Resigned totalManagerFee = 4,000 BDT');

  // 3. Verify Monthly Data does NOT contain managerAssignment
  const monthData = sanitizeAndBuildPublicData(
    '2026-11',
    [{ id: 'mem1', name: 'Member 1', room: '101', floor: '1st', status: 'Active' }],
    meals,
    expenses,
    [],
    { managerFeePerMeal: 5 }
  );

  assert(!('managerAssignment' in monthData), 'Monthly data strictly DOES NOT contain managerAssignment (Non-duplicated)');
  assert(monthData.summary.totalMeals === 500, 'Monthly summary meals = 500');
  assert(monthData.summary.totalExpenses === 10000, 'Monthly summary expenses = 10,000');
}

console.log('\n========================================================================');
console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('========================================================================\n');

if (failed > 0) {
  process.exit(1);
}
