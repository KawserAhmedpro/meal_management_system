// test_manager_dashboard_control.mjs
// Verification of Manager Dropdown Controlling Entire Dashboard

import assert from 'assert';
import {
  calculateManagerAssignmentDashboardOverview,
  calculateAllManagerAssignmentPeriods,
} from './src/utils/calculations.ts';

console.log('========================================================================');
console.log('MANAGER DROPDOWN DASHBOARD CONTROL TEST SUITE');
console.log('========================================================================\n');

// 1. Setup mock members
const mockMembers = [
  { id: 'MEM-001', name: 'Member One', room: '101', status: 'Active' },
  { id: 'MEM-002', name: 'Member Two', room: '102', status: 'Active' },
  { id: 'MEM-003', name: 'Member Three', room: '103', status: 'Inactive' },
];

// 2. Setup mock managers with non-overlapping tenures
// Manager A: 2026-11-01 to 2026-11-15 (Resigned)
// Manager B: 2026-11-16 to ongoing (Active)
const mockManagers = [
  {
    id: 'MGR-A',
    name: 'Manager Alpha',
    startDate: '2026-11-01',
    endDate: '2026-11-15',
    status: 'Resigned',
    feeRateOverride: 5,
  },
  {
    id: 'MGR-B',
    name: 'Manager Beta',
    startDate: '2026-11-16',
    endDate: null,
    status: 'Active',
    feeRateOverride: 6, // Custom fee rate
  },
];

// 3. Mock meals:
// Manager A tenure (Nov 1 - Nov 15):
// Nov 02: MEM-001 has 10 meals, MEM-002 has 10 meals (Total: 20)
// Nov 05: MEM-001 has 15 meals, MEM-002 has 15 meals (Total: 30)
// Total meals Manager A = 50 meals
//
// Manager B tenure (Nov 16 - Nov 25):
// Nov 18: MEM-001 has 20 meals, MEM-002 has 20 meals (Total: 40)
// Nov 20: MEM-001 has 30 meals, MEM-002 has 30 meals (Total: 60)
// Total meals Manager B = 100 meals
const mockMeals = [
  // Manager A meals
  { id: 'ML-01', memberId: 'MEM-001', date: '2026-11-02', month: '2026-11', count: 10 },
  { id: 'ML-02', memberId: 'MEM-002', date: '2026-11-02', month: '2026-11', count: 10 },
  { id: 'ML-03', memberId: 'MEM-001', date: '2026-11-05', month: '2026-11', count: 15 },
  { id: 'ML-04', memberId: 'MEM-002', date: '2026-11-05', month: '2026-11', count: 15 },
  // Manager B meals
  { id: 'ML-05', memberId: 'MEM-001', date: '2026-11-18', month: '2026-11', count: 20 },
  { id: 'ML-06', memberId: 'MEM-002', date: '2026-11-18', month: '2026-11', count: 20 },
  { id: 'ML-07', memberId: 'MEM-001', date: '2026-11-20', month: '2026-11', count: 30 },
  { id: 'ML-08', memberId: 'MEM-002', date: '2026-11-20', month: '2026-11', count: 30 },
];

// 4. Mock expenses:
// Manager A expenses (Market/Bazaar):
// Nov 03: 1,500 BDT (market)
// Nov 10: 1,000 BDT (market)
// Total Market Expenses Manager A = 2,500 BDT
//
// Manager B expenses (Market/Bazaar):
// Nov 17: 3,000 BDT (market)
// Nov 22: 4,000 BDT (market)
// Total Market Expenses Manager B = 7,000 BDT
const mockExpenses = [
  { id: 'EXP-01', date: '2026-11-03', month: '2026-11', title: 'Fish & Rice', category: 'Fish', amount: 1500 },
  { id: 'EXP-02', date: '2026-11-10', month: '2026-11', title: 'Vegetables', category: 'Bazaar', amount: 1000 },
  { id: 'EXP-03', date: '2026-11-17', month: '2026-11', title: 'Chicken', category: 'Meat', amount: 3000 },
  { id: 'EXP-04', date: '2026-11-22', month: '2026-11', title: 'Groceries', category: 'Grocery', amount: 4000 },
];

// 5. Mock deposits:
// Manager A deposits:
// Nov 01: MEM-001 deposits 2,000 BDT
// Nov 02: MEM-002 deposits 1,000 BDT
// Total deposits Manager A = 3,000 BDT
//
// Manager B deposits:
// Nov 16: MEM-001 deposits 5,000 BDT
// Nov 17: MEM-002 deposits 3,000 BDT
// Total deposits Manager B = 8,000 BDT
const mockDeposits = [
  { id: 'DEP-01', memberId: 'MEM-001', date: '2026-11-01', month: '2026-11', amount: 2000 },
  { id: 'DEP-02', memberId: 'MEM-002', date: '2026-11-02', month: '2026-11', amount: 1000 },
  { id: 'DEP-03', memberId: 'MEM-001', date: '2026-11-16', month: '2026-11', amount: 5000 },
  { id: 'DEP-04', memberId: 'MEM-002', date: '2026-11-17', month: '2026-11', amount: 3000 },
];

const mockClosures = [];
const referenceDate = '2026-11-25';

// =========================================================================
// TEST 1: Manager A (Resigned tenure Nov 01 - Nov 15)
// =========================================================================
console.log('Test 1: Dashboard statistics when Manager A is selected');
const dashboardA = calculateManagerAssignmentDashboardOverview(
  mockManagers[0],
  mockMembers,
  mockMeals,
  mockExpenses,
  mockDeposits,
  mockClosures,
  5,
  referenceDate
);

// Verify Manager A StatCards metrics:
// Total Meals = 50
assert.strictEqual(dashboardA.overview.totalMeals, 50, 'Manager A total meals must be 50');
// Total Market Expenses = 2,500
assert.strictEqual(dashboardA.overview.totalExpenses, 2500, 'Manager A market expenses must be 2500');
// Meal Rate = 2500 / 50 = 50 BDT
assert.strictEqual(dashboardA.overview.mealRate, 50, 'Manager A meal rate must be 50 BDT/meal');
// Total Deposits = 3,000
assert.strictEqual(dashboardA.overview.totalDeposits, 3000, 'Manager A deposits must be 3000');
// Total Manager Fees = 50 * 5 = 250 BDT
assert.strictEqual(dashboardA.overview.totalManagerFees, 250, 'Manager A total manager fees must be 250 BDT');
// Total Payable = 2,500 (meals) + 250 (fees) = 2,750 BDT
assert.strictEqual(dashboardA.overview.totalPayable, 2750, 'Manager A total payable must be 2750 BDT');
// Total Members (period-independent) = 3
assert.strictEqual(dashboardA.overview.totalMembers, 3, 'Total members count must be 3');
assert.strictEqual(dashboardA.overview.activeMembers, 2, 'Active members count must be 2');

// Verify Member Financial Summaries under Manager A:
// MEM-001: 25 meals * 50 = 1250 meal cost; 25 * 5 = 125 fee. Total payable = 1375. Deposit = 2000. Due = 1375 - 2000 = -625 (Advance: 625)
// MEM-002: 25 meals * 50 = 1250 meal cost; 25 * 5 = 125 fee. Total payable = 1375. Deposit = 1000. Due = 1375 - 1000 = +375 (Due: 375)
const mem1A = dashboardA.memberSummaries.find((m) => m.member.id === 'MEM-001');
const mem2A = dashboardA.memberSummaries.find((m) => m.member.id === 'MEM-002');
assert.strictEqual(mem1A.due, -625, 'MEM-001 due under Manager A must be -625 (625 advance)');
assert.strictEqual(mem2A.due, 375, 'MEM-002 due under Manager A must be +375');
assert.strictEqual(dashboardA.overview.totalDue, 375, 'Total Outstanding Due under Manager A must be 375');
assert.strictEqual(dashboardA.overview.totalAdvance, 625, 'Total Advance under Manager A must be 625');

// Verify zero data leakage from Manager B into Manager A:
assert.strictEqual(dashboardA.periodExpenses.length, 2, 'Manager A must have exactly 2 expenses');
assert.strictEqual(dashboardA.periodDeposits.length, 2, 'Manager A must have exactly 2 deposits');
assert.strictEqual(dashboardA.periodMealEntries.length, 4, 'Manager A must have exactly 4 meal entries');
console.log('  ✓ PASS: Manager A Dashboard statistics calculated with 0% data leakage from Manager B\n');

// =========================================================================
// TEST 2: Manager B (Active tenure Nov 16 - Today/ReferenceDate Nov 25)
// =========================================================================
console.log('Test 2: Dashboard statistics when Manager B is selected');
const dashboardB = calculateManagerAssignmentDashboardOverview(
  mockManagers[1],
  mockMembers,
  mockMeals,
  mockExpenses,
  mockDeposits,
  mockClosures,
  5,
  referenceDate
);

// Verify Manager B StatCards metrics:
// Total Meals = 100
assert.strictEqual(dashboardB.overview.totalMeals, 100, 'Manager B total meals must be 100');
// Total Market Expenses = 7,000
assert.strictEqual(dashboardB.overview.totalExpenses, 7000, 'Manager B market expenses must be 7000');
// Meal Rate = 7000 / 100 = 70 BDT
assert.strictEqual(dashboardB.overview.mealRate, 70, 'Manager B meal rate must be 70 BDT/meal');
// Total Deposits = 8,000
assert.strictEqual(dashboardB.overview.totalDeposits, 8000, 'Manager B deposits must be 8000');
// Total Manager Fees = 100 * 6 = 600 BDT (custom rate 6 BDT/meal)
assert.strictEqual(dashboardB.overview.totalManagerFees, 600, 'Manager B manager fees must be 600 BDT (100 * 6)');
// Total Payable = 7,000 (meals) + 600 (fees) = 7,600 BDT
assert.strictEqual(dashboardB.overview.totalPayable, 7600, 'Manager B total payable must be 7600 BDT');

// Verify Member Financial Summaries under Manager B:
// MEM-001: 50 meals * 70 = 3500 meal cost; 50 * 6 = 300 fee. Total payable = 3800. Deposit = 5000. Due = 3800 - 5000 = -1200 (Advance: 1200)
// MEM-002: 50 meals * 70 = 3500 meal cost; 50 * 6 = 300 fee. Total payable = 3800. Deposit = 3000. Due = 3800 - 3000 = +800 (Due: 800)
const mem1B = dashboardB.memberSummaries.find((m) => m.member.id === 'MEM-001');
const mem2B = dashboardB.memberSummaries.find((m) => m.member.id === 'MEM-002');
assert.strictEqual(mem1B.due, -1200, 'MEM-001 due under Manager B must be -1200 (1200 advance)');
assert.strictEqual(mem2B.due, 800, 'MEM-002 due under Manager B must be +800');
assert.strictEqual(dashboardB.overview.totalDue, 800, 'Total Outstanding Due under Manager B must be 800');
assert.strictEqual(dashboardB.overview.totalAdvance, 1200, 'Total Advance under Manager B must be 1200');

// Verify zero data leakage from Manager A into Manager B:
assert.strictEqual(dashboardB.periodExpenses.length, 2, 'Manager B must have exactly 2 expenses');
assert.strictEqual(dashboardB.periodDeposits.length, 2, 'Manager B must have exactly 2 deposits');
assert.strictEqual(dashboardB.periodMealEntries.length, 4, 'Manager B must have exactly 4 meal entries');
console.log('  ✓ PASS: Manager B Dashboard statistics calculated with 0% data leakage from Manager A\n');

// =========================================================================
// TEST 3: Strict Separation of Meal Rate from Manager Fee
// =========================================================================
console.log('Test 3: Manager fee separation verification');
// Manager A: Market = 2500, Meals = 50 -> Rate = 50 BDT (NOT 55 BDT)
assert.strictEqual(dashboardA.overview.mealRate, 50, 'Manager fee MUST NOT be added to meal rate for Manager A');
// Manager B: Market = 7000, Meals = 100 -> Rate = 70 BDT (NOT 76 BDT)
assert.strictEqual(dashboardB.overview.mealRate, 70, 'Manager fee MUST NOT be added to meal rate for Manager B');
console.log('  ✓ PASS: Manager fee is strictly separate from Meal Rate\n');

// =========================================================================
// TEST 4: FULL_OFF Day Exclusions
// =========================================================================
console.log('Test 4: FULL_OFF Day handling');
const mockClosuresWithOff = [
  { date: '2026-11-05', month: '2026-11', status: 'FULL_OFF' },
];
const dashboardAWithOff = calculateManagerAssignmentDashboardOverview(
  mockManagers[0],
  mockMembers,
  mockMeals,
  mockExpenses,
  mockDeposits,
  mockClosuresWithOff,
  5,
  referenceDate
);
// On Nov 05, meals were 30 (15+15). With FULL_OFF, those 30 meals are 0!
// So total meals = 50 - 30 = 20 meals!
assert.strictEqual(dashboardAWithOff.overview.totalMeals, 20, 'FULL_OFF day must exclude meals');
assert.strictEqual(dashboardAWithOff.overview.fullOffDatesCount, 1, 'Full OFF dates count must be 1');
assert.strictEqual(dashboardAWithOff.overview.mealRate, 2500 / 20, 'Meal rate with FULL_OFF = 2500 / 20 = 125');
assert.strictEqual(dashboardAWithOff.overview.totalManagerFees, 20 * 5, 'Manager fee = 20 * 5 = 100');
console.log('  ✓ PASS: FULL_OFF dates properly excluded from meals and manager fees\n');

// =========================================================================
// TEST 5: Zero Meals Safety
// =========================================================================
console.log('Test 5: Zero meals safety');
const dashboardZero = calculateManagerAssignmentDashboardOverview(
  mockManagers[0],
  mockMembers,
  [], // 0 meals
  mockExpenses,
  mockDeposits,
  [],
  5,
  referenceDate
);
assert.strictEqual(dashboardZero.overview.totalMeals, 0, 'Total meals must be 0');
assert.strictEqual(dashboardZero.overview.mealRate, 0, 'Meal rate with 0 meals must be 0 (not NaN or Infinity)');
assert.strictEqual(Number.isFinite(dashboardZero.overview.mealRate), true, 'Meal rate must be finite');
assert.strictEqual(dashboardZero.overview.totalManagerFees, 0, 'Manager fee with 0 meals must be 0');
console.log('  ✓ PASS: Zero meal periods handled gracefully\n');

console.log('========================================================================');
console.log('ALL 5 TESTS PASSED SUCCESSFULLY!');
console.log('========================================================================');
