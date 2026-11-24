// test_public_portal_manager_control.mjs
// Verification of Public Member Portal Manager-Wise View & Calculation Consistency

import assert from 'assert';
import {
  calculateManagerAssignmentDashboardOverview,
  calculateManagerAssignmentPeriodAccounting,
} from './src/utils/calculations.ts';
import {
  buildPublicCurrentManagerSummary,
  buildPublicAllManagersSummary,
  sanitizeAndBuildPublicData,
} from './src/services/publicPortal.ts';

console.log('========================================================================');
console.log('PUBLIC MEMBER PORTAL MANAGER-WISE VIEW TEST SUITE');
console.log('========================================================================\n');

// 1. Setup mock data
const mockMembers = [
  { id: 'MEM-001', name: 'Member Alpha', room: '101', floor: '1st', status: 'Active' },
  { id: 'MEM-002', name: 'Member Beta', room: '102', floor: '1st', status: 'Active' },
  { id: 'MEM-003', name: 'Member Gamma', room: '103', floor: '1st', status: 'Active' },
];

// Manager A (Resigned): 2026-11-01 to 2026-11-15
// Manager B (Active): 2026-11-16 to ongoing
const mockManagers = [
  {
    id: 'MGR-A',
    name: 'Manager Old',
    startDate: '2026-11-01',
    endDate: '2026-11-15',
    status: 'Resigned',
  },
  {
    id: 'MGR-B',
    name: 'Manager New',
    startDate: '2026-11-16',
    status: 'Active',
  },
];

// Meal entries:
// Manager A period: 2026-11-01 to 2026-11-15 (10 days * 3 members * 1 = 30 meals)
// Manager B period: 2026-11-16 to 2026-11-20 (5 days * 3 members * 2 = 30 meals)
const mockMealEntries = [];
for (let d = 1; d <= 10; d++) {
  const dayStr = String(d).padStart(2, '0');
  for (const m of mockMembers) {
    mockMealEntries.push({
      id: `MEAL-${m.id}-${dayStr}`,
      memberId: m.id,
      date: `2026-11-${dayStr}`,
      month: '2026-11',
      count: 1,
      type: 'ON',
    });
  }
}
for (let d = 16; d <= 20; d++) {
  const dayStr = String(d).padStart(2, '0');
  for (const m of mockMembers) {
    mockMealEntries.push({
      id: `MEAL-${m.id}-${dayStr}`,
      memberId: m.id,
      date: `2026-11-${dayStr}`,
      month: '2026-11',
      count: 2,
      type: 'Double',
    });
  }
}

// Expenses:
// Manager A period: 3,000 BDT
// Manager B period: 4,500 BDT
const mockExpenses = [
  {
    id: 'EXP-1',
    date: '2026-11-05',
    month: '2026-11',
    title: 'Manager A Bazaar',
    amount: 3000,
    category: 'Market',
  },
  {
    id: 'EXP-2',
    date: '2026-11-18',
    month: '2026-11',
    title: 'Manager B Bazaar',
    amount: 4500,
    category: 'Market',
  },
];

// Test 1: buildPublicAllManagersSummary includes all managers (Active, Resigned)
console.log('Test 1: buildPublicAllManagersSummary coverage & ordering');
const allPublicManagers = buildPublicAllManagersSummary(
  mockManagers,
  mockMealEntries,
  mockExpenses,
  [],
  5,
  '2026-11-20'
);

assert.strictEqual(allPublicManagers.length, 2, 'Must include both managers');
// Active manager first
assert.strictEqual(allPublicManagers[0].id, 'MGR-B', 'Active manager must be first');
assert.strictEqual(allPublicManagers[0].status, 'active');
assert.strictEqual(allPublicManagers[1].id, 'MGR-A', 'Resigned manager must be included');
assert.strictEqual(allPublicManagers[1].status, 'resigned');
assert.strictEqual(allPublicManagers[1].resignationDate, '2026-11-15');
console.log('  ✓ PASS: Both Active and Resigned managers present in public list with correct status');

// Test 2: Calculation consistency between Admin Dashboard and Public Portal for Manager A
console.log('\nTest 2: Manager A Admin vs Public calculation consistency');
const adminManagerA = calculateManagerAssignmentDashboardOverview(
  mockManagers[0],
  mockMembers,
  mockMealEntries,
  mockExpenses,
  [],
  [],
  5,
  '2026-11-20'
);
const publicManagerA = allPublicManagers.find((m) => m.id === 'MGR-A');

assert.strictEqual(publicManagerA.totalMeals, adminManagerA.managerSummary.totalMeals);
assert.strictEqual(publicManagerA.totalMarketExpenses, adminManagerA.managerSummary.totalMarketExpenses);
assert.strictEqual(publicManagerA.mealRate, adminManagerA.managerSummary.mealRate);
assert.strictEqual(publicManagerA.totalManagerFee, adminManagerA.managerSummary.totalManagerFee);
assert.strictEqual(publicManagerA.totalMeals, 30); // 10 days * 3 members * 1
assert.strictEqual(publicManagerA.totalMarketExpenses, 3000);
assert.strictEqual(publicManagerA.mealRate, 100); // 3000 / 30 = 100
assert.strictEqual(publicManagerA.totalManagerFee, 150); // 30 * 5 = 150
console.log('  ✓ PASS: Manager A Public totals strictly match Admin Dashboard totals (30 meals, ৳3000, ৳100/meal, ৳150 fee)');

// Test 3: Calculation consistency between Admin Dashboard and Public Portal for Manager B
console.log('\nTest 3: Manager B Admin vs Public calculation consistency');
const adminManagerB = calculateManagerAssignmentDashboardOverview(
  mockManagers[1],
  mockMembers,
  mockMealEntries,
  mockExpenses,
  [],
  [],
  5,
  '2026-11-20'
);
const publicManagerB = allPublicManagers.find((m) => m.id === 'MGR-B');

assert.strictEqual(publicManagerB.totalMeals, adminManagerB.managerSummary.totalMeals);
assert.strictEqual(publicManagerB.totalMarketExpenses, adminManagerB.managerSummary.totalMarketExpenses);
assert.strictEqual(publicManagerB.mealRate, adminManagerB.managerSummary.mealRate);
assert.strictEqual(publicManagerB.totalManagerFee, adminManagerB.managerSummary.totalManagerFee);
assert.strictEqual(publicManagerB.totalMeals, 30); // 5 days * 3 members * 2
assert.strictEqual(publicManagerB.totalMarketExpenses, 4500);
assert.strictEqual(publicManagerB.mealRate, 150); // 4500 / 30 = 150
assert.strictEqual(publicManagerB.totalManagerFee, 150); // 30 * 5 = 150
console.log('  ✓ PASS: Manager B Public totals strictly match Admin Dashboard totals (30 meals, ৳4500, ৳150/meal, ৳150 fee)');

// Test 4: Zero data leakage between manager assignment periods
console.log('\nTest 4: Cross-tenure data leakage check');
assert.notStrictEqual(publicManagerA.totalMarketExpenses, publicManagerB.totalMarketExpenses);
assert.strictEqual(publicManagerA.totalMarketExpenses + publicManagerB.totalMarketExpenses, 7500);
console.log('  ✓ PASS: Zero expenses or meals leaked between Manager A and Manager B');

// Test 5: Strict Public Privacy Guarantee (No private member data exposed)
console.log('\nTest 5: Public Data Privacy & Sanitization Check');
for (const mgr of allPublicManagers) {
  assert.strictEqual(mgr.deposits, undefined, 'Deposits must not exist on public manager');
  assert.strictEqual(mgr.due, undefined, 'Dues must not exist on public manager');
  assert.strictEqual(mgr.advance, undefined, 'Advance must not exist on public manager');
  assert.strictEqual(mgr.phone, undefined, 'Phone must not exist on public manager');
  assert.strictEqual(mgr.notes, undefined, 'Notes must not exist on public manager');
}
const publicMonthData = sanitizeAndBuildPublicData(
  '2026-11',
  mockMembers,
  mockMealEntries,
  mockExpenses,
  [],
  { managerFeePerMeal: 5 },
  mockManagers
);
for (const mem of publicMonthData.members) {
  assert.strictEqual(mem.deposits, undefined, 'Deposits must not exist on public member');
  assert.strictEqual(mem.due, undefined, 'Dues must not exist on public member');
  assert.strictEqual(mem.balance, undefined, 'Balance must not exist on public member');
}
console.log('  ✓ PASS: Zero private member finances exposed across all public outputs');

console.log('\n========================================================================');
console.log('ALL 5 PUBLIC PORTAL MANAGER TEST SCENARIOS PASSED SUCCESSFULLY!');
console.log('========================================================================\n');
