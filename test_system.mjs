import { readFileSync } from 'fs';
import * as XLSX from 'xlsx';

console.log('=============================================');
console.log('RUNNING MEAL MANAGEMENT SYSTEM TEST SUITE');
console.log('=============================================\n');

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    testsPassed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    testsFailed++;
  }
}

// -------------------------------------------------------------
// TEST 1: Calculation Logic Tests
// -------------------------------------------------------------
console.log('Test Group 1: Financial & Meal Calculations');

function calculateTestMonth(month, members, mealEntries, expenses, deposits, managerFeePerMeal = 5) {
  const monthMeals = mealEntries.filter((m) => m.month === month);
  const monthExpenses = expenses.filter((e) => e.month === month);
  const monthDeposits = deposits.filter((d) => d.month === month);

  const totalMeals = monthMeals.reduce((sum, entry) => sum + (entry.count || 0), 0);
  const totalExpenses = monthExpenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
  const mealRate = totalMeals > 0 ? totalExpenses / totalMeals : 0;

  const memberMealCountMap = new Map();
  for (const entry of monthMeals) {
    const cur = memberMealCountMap.get(entry.memberId) || 0;
    memberMealCountMap.set(entry.memberId, cur + (entry.count || 0));
  }

  const memberDepositsMap = new Map();
  for (const dep of monthDeposits) {
    const cur = memberDepositsMap.get(dep.memberId) || { total: 0, count: 0 };
    memberDepositsMap.set(dep.memberId, {
      total: cur.total + (dep.amount || 0),
      count: cur.count + 1,
    });
  }

  const memberSummaries = members.map((member) => {
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
    };
  });

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

  return {
    totalMeals,
    totalExpenses,
    mealRate,
    totalMealExpenses,
    totalManagerFees,
    totalPayable,
    totalDeposits,
    totalDue,
    totalAdvance,
    netBalance: totalDeposits - totalPayable,
    memberSummaries,
  };
}

// Case A: Zero meals (handles divide-by-zero safely)
const zeroResult = calculateTestMonth(
  '2026-03',
  [{ id: 'M1', name: 'User 1' }],
  [],
  [{ month: '2026-03', amount: 500 }],
  []
);
assert(zeroResult.mealRate === 0, 'Zero meals results in mealRate = 0 (no NaN)');
assert(!isNaN(zeroResult.mealRate), 'mealRate is not NaN when meals = 0');

// Case B: Standard monthly calculations
// Member 1: 30 meals (20 ON = 20, 5 Double = 10, 5 OFF = 0).
// Member 2: 20 meals (20 ON = 20).
// Total meals = 50. Total expense = 3,000 BDT.
// Meal rate = 3000 / 50 = 60.00 BDT/meal.
// Member 1:
//   Meal cost = 30 * 60 = 1,800
//   Mgr fee = 30 * 5 = 150
//   Total payable = 1,950
//   Deposit = 2,500
//   Due = 1950 - 2500 = -550 (Advance / Refund of 550)
// Member 2:
//   Meal cost = 20 * 60 = 1,200
//   Mgr fee = 20 * 5 = 100
//   Total payable = 1,300
//   Deposit = 1,000
//   Due = 1300 - 1000 = +300 (Owes 300)
const testMembers = [
  { id: 'M1', name: 'Ashik', room: 'ROOM-101' },
  { id: 'M2', name: 'Srabon', room: 'ROOM-102' },
];
const testMeals = [
  // M1: 20 ON (count 1), 5 Double (count 2), 5 OFF (count 0)
  ...Array.from({ length: 20 }, (_, i) => ({ memberId: 'M1', month: '2026-03', type: 'ON', count: 1 })),
  ...Array.from({ length: 5 }, (_, i) => ({ memberId: 'M1', month: '2026-03', type: 'Double', count: 2 })),
  ...Array.from({ length: 5 }, (_, i) => ({ memberId: 'M1', month: '2026-03', type: 'OFF', count: 0 })),
  // M2: 20 ON (count 1)
  ...Array.from({ length: 20 }, (_, i) => ({ memberId: 'M2', month: '2026-03', type: 'ON', count: 1 })),
];
const testExpenses = [
  { month: '2026-03', amount: 1800, category: 'Market' },
  { month: '2026-03', amount: 1200, category: 'Rice' },
];
const testDeposits = [
  { memberId: 'M1', month: '2026-03', amount: 2500 },
  { memberId: 'M2', month: '2026-03', amount: 1000 },
];

const res = calculateTestMonth('2026-03', testMembers, testMeals, testExpenses, testDeposits, 5);

assert(res.totalMeals === 50, 'Total meals correctly counts ON(1)+Double(2) and ignores OFF(0)');
assert(res.totalExpenses === 3000, 'Total expenses sum up correctly (3000 BDT)');
assert(res.mealRate === 60, 'Meal rate correctly calculated as 3000 / 50 = 60.00 BDT');

const m1 = res.memberSummaries.find((s) => s.member.id === 'M1');
assert(m1.totalMeals === 30, 'M1 total meals = 30');
assert(m1.mealExpenseWithoutFee === 1800, 'M1 meal expense without fee = 1800');
assert(m1.managerFee === 150, 'M1 manager fee (30 * 5) = 150');
assert(m1.totalPayable === 1950, 'M1 total payable (1800 + 150) = 1950');
assert(m1.due === -550, 'M1 due is negative (-550) representing advance/refundable balance');

const m2 = res.memberSummaries.find((s) => s.member.id === 'M2');
assert(m2.totalMeals === 20, 'M2 total meals = 20');
assert(m2.mealExpenseWithoutFee === 1200, 'M2 meal expense without fee = 1200');
assert(m2.managerFee === 100, 'M2 manager fee (20 * 5) = 100');
assert(m2.totalPayable === 1300, 'M2 total payable (1200 + 100) = 1300');
assert(m2.due === 300, 'M2 due is positive (+300) representing outstanding balance');

assert(res.totalDue === 300, 'Mess total outstanding due = 300');
assert(res.totalAdvance === 550, 'Mess total advance credit = 550');
assert(res.totalDeposits === 3500, 'Mess total deposits = 3500');
assert(res.totalPayable === 3250, 'Mess total payable = 3250');
assert(res.netBalance === 250, 'Mess net cash balance = 250');

// -------------------------------------------------------------
// TEST 2: SULTAN MEAL.xlsx Real File Verification
// -------------------------------------------------------------
console.log('\nTest Group 2: SULTAN MEAL.xlsx Real Workbook Integrity');
const fileBuffer = readFileSync('d:/Meal Management System/SULTAN MEAL.xlsx');
const wb = XLSX.read(fileBuffer, { type: 'buffer' });

assert(wb.SheetNames.includes('Costs'), 'Costs sheet is present in SULTAN MEAL.xlsx');
assert(wb.SheetNames.includes('Meals'), 'Meals sheet is present in SULTAN MEAL.xlsx');
assert(wb.SheetNames.includes('Transactions'), 'Transactions sheet is present in SULTAN MEAL.xlsx');
assert(wb.SheetNames.includes('Print'), 'Print sheet is present in SULTAN MEAL.xlsx');

// Inspect Transactions sheet data
const transSheet = wb.Sheets['Transactions'];
const transData = XLSX.utils.sheet_to_json(transSheet, { header: 1 });
let memberCount = 0;
let roomSet = new Set();
for (const row of transData) {
  const colA = String(row[0] || '').trim();
  const colB = String(row[1] || '').trim();
  if (colA.startsWith('ROOM')) roomSet.add(colA);
  if (colB && !['NAME', 'TOTAL', 'ROOM NO', 'TOTAL DEPOSITS'].includes(colB.toUpperCase())) {
    memberCount++;
  }
}
assert(memberCount >= 170, `Workbook contains ${memberCount} members (>= 170 members preserved)`);
assert(roomSet.size >= 40, `Workbook contains ${roomSet.size} rooms across floors (>= 40 rooms preserved)`);

// -------------------------------------------------------------
// TEST 3: Seed Data & Schema Integrity
// -------------------------------------------------------------
console.log('\nTest Group 3: Seed Data & Schema Validation');
const seedMembersJson = JSON.parse(readFileSync('d:/Meal Management System/extracted_members.json', 'utf-8'));
assert(seedMembersJson.length === 175, 'Extracted seed dataset has exactly 175 members matching workbook');
assert(seedMembersJson[0].name === 'ashik' && seedMembersJson[0].room === 'ROOM-101', 'First member is ashik in ROOM-101');
const room00Members = seedMembersJson.filter(m => m.room === 'ROOM-00');
assert(room00Members.length === 6, 'ROOM-00 has 6 members preserved (Jakir, Mehedi, etc.)');

console.log('\n=============================================');
console.log(`TEST SUMMARY: ${testsPassed} PASSED, ${testsFailed} FAILED`);
console.log('=============================================\n');

if (testsFailed > 0) process.exit(1);
