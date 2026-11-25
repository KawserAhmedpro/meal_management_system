import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { db } from './src/db/index.ts';
import {
  DataMutationGateway,
  generateOperationId,
  getClientInstanceId,
  generateNextMemberId,
  withEntityLock,
  getActiveEntityLockCount,
} from './src/services/dataGateway.ts';
import { calculateManagerAssignmentPeriodAccounting } from './src/utils/calculations.ts';

console.log('========================================================================');
console.log('PHASE 1 AUTOMATED VERIFICATION SUITE');
console.log('Dual-Storage Sync: Schema Upgrade, Preservation & Transactional Gateway');
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

async function runPhase1Tests() {
  // ===========================================================================
  // TEST GROUP 1: In-Place Dexie Version 2 to Version 3 Upgrade & Data Preservation
  // ===========================================================================
  console.log('--- TEST GROUP 1: In-Place Schema Upgrade (v2 -> v3) & Data Preservation ---');

  const testDbName = 'TestPreservationDB_' + Date.now();
  
  // Step 1: Create a database with the exact legacy Version 2 schema
  const legacyDb = new Dexie(testDbName);
  legacyDb.version(1).stores({
    members: 'id, name, room, floor, status, joiningDate',
    mealEntries: 'id, memberId, date, month, type, [memberId+month]',
    expenses: 'id, date, month, category, amount',
    deposits: 'id, memberId, date, month, amount, room',
    categories: 'id, name',
    settings: 'id',
  });
  legacyDb.version(2).stores({
    members: 'id, name, room, floor, status, joiningDate',
    mealEntries: 'id, memberId, date, month, type, [memberId+month]',
    expenses: 'id, date, month, category, amount',
    deposits: 'id, memberId, date, month, amount, room',
    categories: 'id, name',
    settings: 'id',
    managers: 'id, name, startDate, endDate, status',
    dailyClosures: 'date, month, status',
  });

  await legacyDb.open();
  assert(legacyDb.verno === 2, 'Legacy database successfully opened at version 2');

  // Populate realistic sample data in Version 2
  const initialMembers = [
    { id: 'MEM-001', name: 'Al-Amin', room: '101', floor: '1st', status: 'Active', joiningDate: '2026-01-01', createdAt: 1000, updatedAt: 1000 },
    { id: 'MEM-002', name: 'Tanvir', room: '102', floor: '1st', status: 'Active', joiningDate: '2026-01-01', createdAt: 1000, updatedAt: 1000 },
    { id: 'MEM-003', name: 'Sakib', room: '103', floor: '1st', status: 'Inactive', joiningDate: '2026-01-01', createdAt: 1000, updatedAt: 1000 },
  ];
  const initialMeals = [
    { id: 'MEM-001_2026-03-01', memberId: 'MEM-001', date: '2026-03-01', month: '2026-03', type: 'Double', count: 2, updatedAt: 1000 },
    { id: 'MEM-002_2026-03-01', memberId: 'MEM-002', date: '2026-03-01', month: '2026-03', type: 'ON', count: 1, updatedAt: 1000 },
    { id: 'MEM-001_2026-03-02', memberId: 'MEM-001', date: '2026-03-02', month: '2026-03', type: 'ON', count: 1, updatedAt: 1000 },
  ];
  const initialExpenses = [
    { id: 'EXP-101', date: '2026-03-01', month: '2026-03', title: 'Chicken Bazaar', amount: 1200, category: 'Market', createdAt: 1000 },
    { id: 'EXP-102', date: '2026-03-02', month: '2026-03', title: 'Vegetables', amount: 300, category: 'Market', createdAt: 1000 },
  ];
  const initialDeposits = [
    { id: 'DEP-201', memberId: 'MEM-001', memberName: 'Al-Amin', room: '101', date: '2026-03-01', month: '2026-03', amount: 2000, createdAt: 1000 },
    { id: 'DEP-202', memberId: 'MEM-002', memberName: 'Tanvir', room: '102', date: '2026-03-01', month: '2026-03', amount: 1500, createdAt: 1000 },
  ];
  const initialManagers = [
    { id: 'MGR-HIST-01', name: 'Previous Manager', startDate: '2026-01-01', endDate: '2026-01-31', status: 'Resigned', notes: 'First tenure', createdAt: 500, updatedAt: 800 },
    { id: 'MGR-ACT-02', name: 'Kawser Ahmed Ratul', startDate: '2026-02-01', endDate: null, status: 'Active', notes: 'Current manager', createdAt: 900, updatedAt: 1000 },
  ];
  const initialClosures = [
    { date: '2026-03-15', month: '2026-03', status: 'FULL_OFF', reason: 'Holiday', updatedAt: 1000 }
  ];
  const initialSettings = {
    id: 'app_settings',
    managerName: 'Kawser Ahmed Ratul',
    messName: 'Omar Ekushe Hall Mess',
    institutionName: 'MEC',
    hallName: 'Omar Ekushe Hall',
    currency: 'BDT',
    currencySymbol: '৳',
    managerFeePerMeal: 5,
    theme: 'dark',
    dateFormat: 'YYYY-MM-DD',
    pinLockEnabled: false,
    selectedMonth: '2026-03',
    reminderDays: 3,
  };
  const initialCategories = [
    { id: 'cat-1', name: 'Market', isDefault: true },
    { id: 'cat-2', name: 'Utilities', isDefault: true }
  ];

  await legacyDb.members.bulkPut(initialMembers);
  await legacyDb.mealEntries.bulkPut(initialMeals);
  await legacyDb.expenses.bulkPut(initialExpenses);
  await legacyDb.deposits.bulkPut(initialDeposits);
  await legacyDb.managers.bulkPut(initialManagers);
  await legacyDb.dailyClosures.bulkPut(initialClosures);
  await legacyDb.settings.put(initialSettings);
  await legacyDb.categories.bulkPut(initialCategories);

  // Capture before-upgrade baseline accounting calculations
  const baselineAccounting = calculateManagerAssignmentPeriodAccounting(
    initialManagers[1],
    initialMeals,
    initialExpenses,
    initialClosures,
    initialSettings.managerFeePerMeal
  );

  const beforeCounts = {
    members: await legacyDb.members.count(),
    mealEntries: await legacyDb.mealEntries.count(),
    expenses: await legacyDb.expenses.count(),
    deposits: await legacyDb.deposits.count(),
    managers: await legacyDb.managers.count(),
    dailyClosures: await legacyDb.dailyClosures.count(),
    settings: await legacyDb.settings.count(),
    categories: await legacyDb.categories.count(),
  };

  legacyDb.close();

  // Step 2: Open the same database using the new Version 3 schema definition
  const upgradedDb = new Dexie(testDbName);
  upgradedDb.version(1).stores({
    members: 'id, name, room, floor, status, joiningDate',
    mealEntries: 'id, memberId, date, month, type, [memberId+month]',
    expenses: 'id, date, month, category, amount',
    deposits: 'id, memberId, date, month, amount, room',
    categories: 'id, name',
    settings: 'id',
  });
  upgradedDb.version(2).stores({
    members: 'id, name, room, floor, status, joiningDate',
    mealEntries: 'id, memberId, date, month, type, [memberId+month]',
    expenses: 'id, date, month, category, amount',
    deposits: 'id, memberId, date, month, amount, room',
    categories: 'id, name',
    settings: 'id',
    managers: 'id, name, startDate, endDate, status',
    dailyClosures: 'date, month, status',
  });
  upgradedDb.version(3).stores({
    members: 'id, name, room, floor, status, joiningDate, _isDeleted',
    mealEntries: 'id, memberId, date, month, type, [memberId+month], _isDeleted',
    expenses: 'id, date, month, category, amount, _isDeleted',
    deposits: 'id, memberId, date, month, amount, room, _isDeleted',
    categories: 'id, name',
    settings: 'id',
    managers: 'id, name, startDate, endDate, status, _isDeleted',
    dailyClosures: 'date, month, status, _isDeleted',
    sync_outbox: 'opId, collectionName, entityId, status, createdAt, leaseExpiresAt, [collectionName+entityId+status]',
    sync_receipts: 'opId, entityId, collectionName, committedAt, expiresAt',
    conflicts: 'id, opId, collectionName, entityId, status, detectedAt',
    manager_corrections: 'id, targetManagerId, createdAt, authorizedBy',
  });
  upgradedDb.version(4).stores({
    members: 'id, name, room, floor, status, joiningDate, _isDeleted',
    mealEntries: 'id, memberId, date, month, type, [memberId+month], _isDeleted',
    expenses: 'id, date, month, category, amount, _isDeleted',
    deposits: 'id, memberId, date, month, amount, room, _isDeleted',
    categories: 'id, name',
    settings: 'id',
    managers: 'id, name, startDate, endDate, status, _isDeleted',
    dailyClosures: 'date, month, status, _isDeleted',
    sync_outbox: 'opId, collectionName, entityId, status, createdAt, leaseExpiresAt, [collectionName+entityId+status]',
    sync_receipts: 'opId, entityId, collectionName, committedAt, expiresAt',
    conflicts: 'id, opId, collectionName, entityId, status, detectedAt',
    manager_corrections: 'id, targetManagerId, createdAt, authorizedBy',
    sequence_counters: 'id',
  }).upgrade(async (tx) => {
    const members = await tx.table('members').toArray();
    let maxNum = 0;
    for (const m of members) {
      const match = m.id && m.id.match(/^MEM-(\d+)$/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    }
    await tx.table('sequence_counters').put({
      id: 'member_id',
      lastValue: maxNum,
      updatedAt: Date.now(),
    });
  });

  await upgradedDb.open();
  assert(upgradedDb.verno === 4, 'Upgraded database successfully opened at version 4');

  // Verify all 5 new tables exist and are ready
  assert(upgradedDb.sync_outbox !== undefined, 'sync_outbox table exists');
  assert(upgradedDb.sync_receipts !== undefined, 'sync_receipts table exists');
  assert(upgradedDb.conflicts !== undefined, 'conflicts table exists');
  assert(upgradedDb.manager_corrections !== undefined, 'manager_corrections table exists');
  assert(upgradedDb.sequence_counters !== undefined, 'sequence_counters table exists');
  const initialSeq = await upgradedDb.sequence_counters.get('member_id');
  assert(initialSeq !== undefined && initialSeq.lastValue === 3, `sequence_counters initialized to highest member ID (MEM-003): ${initialSeq?.lastValue}`);

  // Verify zero records lost across all existing tables
  const afterCounts = {
    members: await upgradedDb.members.count(),
    mealEntries: await upgradedDb.mealEntries.count(),
    expenses: await upgradedDb.expenses.count(),
    deposits: await upgradedDb.deposits.count(),
    managers: await upgradedDb.managers.count(),
    dailyClosures: await upgradedDb.dailyClosures.count(),
    settings: await upgradedDb.settings.count(),
    categories: await upgradedDb.categories.count(),
  };

  for (const table of Object.keys(beforeCounts)) {
    assert(
      beforeCounts[table] === afterCounts[table],
      `Table [${table}] count preserved exactly: before=${beforeCounts[table]}, after=${afterCounts[table]}`
    );
  }

  // Verify data integrity of individual fields
  const preservedMember = await upgradedDb.members.get('MEM-001');
  assert(preservedMember.name === 'Al-Amin' && preservedMember.room === '101', 'Member record fields 100% intact');

  const preservedResignedManager = await upgradedDb.managers.get('MGR-HIST-01');
  assert(preservedResignedManager.status === 'Resigned' && preservedResignedManager.endDate === '2026-01-31', 'Resigned manager status & tenure dates 100% intact');

  const preservedSettings = await upgradedDb.settings.get('app_settings');
  assert(preservedSettings.messName === 'Omar Ekushe Hall Mess', 'Settings record 100% intact');

  // Verify calculation results after upgrade are byte-identical
  const upgradedMeals = await upgradedDb.mealEntries.toArray();
  const upgradedExpenses = await upgradedDb.expenses.toArray();
  const upgradedClosures = await upgradedDb.dailyClosures.toArray();
  const upgradedManager = await upgradedDb.managers.get('MGR-ACT-02');

  const afterAccounting = calculateManagerAssignmentPeriodAccounting(
    upgradedManager,
    upgradedMeals,
    upgradedExpenses,
    upgradedClosures,
    preservedSettings.managerFeePerMeal
  );

  assert(baselineAccounting.totalMeals === afterAccounting.totalMeals, `Total meals preserved: ${afterAccounting.totalMeals}`);
  assert(baselineAccounting.totalMarketExpenses === afterAccounting.totalMarketExpenses, `Total expenses preserved: ${afterAccounting.totalMarketExpenses}`);
  assert(baselineAccounting.mealRate === afterAccounting.mealRate, `Meal rate preserved: ${afterAccounting.mealRate}`);
  assert(baselineAccounting.totalManagerFee === afterAccounting.totalManagerFee, `Manager fee preserved: ${afterAccounting.totalManagerFee}`);

  upgradedDb.close();

  // ===========================================================================
  // TEST GROUP 2: DataMutationGateway Atomic Transactions & Sequencing
  // ===========================================================================
  console.log('\n--- TEST GROUP 2: DataMutationGateway Atomic Transactions & Outbox ---');

  await db.open();
  assert(db.verno === 4, 'Active application db is running at version 4');
  assert(db.sequence_counters !== undefined, 'sequence_counters table exists in active db');

  // Test 2.1: Atomic write of Member and Outbox
  const newMember = {
    id: 'MEM-999',
    name: 'Test Member',
    room: '305',
    floor: '3rd',
    status: 'Active',
    joiningDate: '2026-11-25',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const memberResult = await DataMutationGateway.saveMember(newMember);
  assert(memberResult.entity.id === 'MEM-999', 'Member saved via Gateway');
  assert(memberResult.entity._version === 1, 'Initial member _version set to 1');
  assert(typeof memberResult.entity._lastOpId === 'string', 'Member has stable operation ID attached');
  assert(memberResult.operation.status === 'pending', 'Outbox operation status is pending');
  assert(memberResult.operation.operationType === 'UPSERT', 'Outbox operationType is UPSERT');
  assert(memberResult.operation.prevEntityVersion === 0, 'prevEntityVersion is 0 for new record');
  assert(memberResult.operation.localVersion === 1, 'localVersion is 1');

  // Verify Outbox table has this record
  const outboxItem = await db.sync_outbox.get(memberResult.operation.opId);
  assert(outboxItem !== undefined, 'Outbox item was durably written to sync_outbox table');
  assert(outboxItem.entityId === 'MEM-999', 'Outbox item points to MEM-999');

  // Test 2.2: Monotonic sequence on successor mutation for same entity
  const updatePayload = {
    ...newMember,
    name: 'Test Member Renamed',
    room: '306',
  };
  const updateResult = await DataMutationGateway.saveMember(updatePayload);
  assert(updateResult.entity._version === 2, 'Successor mutation incremented _version to 2');
  assert(updateResult.operation.localVersion === 2, 'Outbox localVersion is 2');
  assert(updateResult.operation.opId !== memberResult.operation.opId, 'Successor operation has unique opId');

  // Test 2.3: Soft Delete behavior
  const deleteResult = await DataMutationGateway.deleteMember('MEM-999');
  assert(deleteResult.entity._isDeleted === true, 'Soft delete marked _isDeleted: true');
  assert(typeof deleteResult.entity._deletedAt === 'number', '_deletedAt timestamp set');
  assert(deleteResult.operation.operationType === 'SOFT_DELETE', 'Outbox operationType is SOFT_DELETE');
  assert(deleteResult.entity._version === 3, 'Delete incremented _version to 3');

  // Verify domain table still physically retains the record (no accidental hard delete)
  const softDeletedFromTable = await db.members.get('MEM-999');
  assert(softDeletedFromTable !== undefined, 'Record NOT physically deleted from members table (tombstone preserved)');
  assert(softDeletedFromTable._isDeleted === true, 'Tombstone has _isDeleted: true in members table');

  // Test 2.4: Expense atomic mutation
  const testExpense = {
    id: 'EXP-999',
    date: '2026-11-25',
    month: '2026-11',
    title: 'Fish Bazaar',
    amount: 850,
    category: 'Market',
    createdAt: Date.now(),
  };
  const expenseResult = await DataMutationGateway.saveExpense(testExpense);
  assert(expenseResult.entity.amount === 850, 'Expense saved via Gateway');
  const expenseOutbox = await db.sync_outbox.get(expenseResult.operation.opId);
  assert(expenseOutbox !== undefined && expenseOutbox.collectionName === 'expenses', 'Expense outbox recorded under expenses collection');

  // Test 2.5: Deposit atomic mutation
  const testDeposit = {
    id: 'DEP-999',
    memberId: 'MEM-001',
    memberName: 'Al-Amin',
    room: '101',
    date: '2026-11-25',
    month: '2026-11',
    amount: 1000,
    createdAt: Date.now(),
  };
  const depositResult = await DataMutationGateway.saveDeposit(testDeposit);
  assert(depositResult.entity.amount === 1000, 'Deposit saved via Gateway');

  // Test 2.6: Bulk Meal Entries atomic transaction
  const bulkMeals = [
    { id: 'MEM-001_2026-11-25', memberId: 'MEM-001', date: '2026-11-25', month: '2026-11', count: 1, type: 'ON', updatedAt: Date.now() },
    { id: 'MEM-002_2026-11-25', memberId: 'MEM-002', date: '2026-11-25', month: '2026-11', count: 2, type: 'Double', updatedAt: Date.now() },
  ];
  const bulkSaved = await DataMutationGateway.saveMealEntriesBulk(bulkMeals);
  assert(bulkSaved.length === 2, '2 bulk meals saved');
  const meal1Outbox = await db.sync_outbox.where('entityId').equals('MEM-001_2026-11-25').first();
  const meal2Outbox = await db.sync_outbox.where('entityId').equals('MEM-002_2026-11-25').first();
  assert(meal1Outbox !== undefined && meal2Outbox !== undefined, 'Both bulk meals have dedicated Outbox entries');

  // Test 2.7: Outbox counts & status queries
  const pendingCount = await DataMutationGateway.getPendingOutboxCount();
  assert(pendingCount >= 6, `Pending outbox operations tracked properly: ${pendingCount}`);

  const countsByStatus = await DataMutationGateway.getOutboxCountByStatus();
  assert(countsByStatus.pending === pendingCount, 'Status count matches pending count');
  assert(countsByStatus.quarantined === 0, 'Quarantined count is initially 0');

  // Test 2.8: Quarantined state isolation test
  // Manually update one outbox item to 'quarantined'
  await db.sync_outbox.update(expenseResult.operation.opId, {
    status: 'quarantined',
    quarantineReason: 'VERSION_CONFLICT',
    quarantinedAt: Date.now()
  });

  const updatedCounts = await DataMutationGateway.getOutboxCountByStatus();
  assert(updatedCounts.quarantined === 1, 'Quarantined operation correctly tracked');
  assert(updatedCounts.pending === pendingCount - 1, 'Pending count decremented when item is quarantined');

  const quarantinedOps = await DataMutationGateway.getQuarantinedOperations();
  assert(quarantinedOps.length === 1 && quarantinedOps[0].opId === expenseResult.operation.opId, 'Quarantined item isolated and retrievable');

  // Clean up test items
  await db.members.delete('MEM-999');
  await db.expenses.delete('EXP-999');
  await db.deposits.delete('DEP-999');
  await db.mealEntries.delete('MEM-001_2026-11-25');
  await db.mealEntries.delete('MEM-002_2026-11-25');
  await db.sync_outbox.clear();

  // ===========================================================================
  // TEST GROUP 3: Simulated Crash / Abort Rollback Recovery
  // ===========================================================================
  console.log('\n--- TEST GROUP 3: Simulated Abort & Transactional Rollback ---');

  let aborted = false;
  try {
    await db.transaction('rw', [db.members, db.sync_outbox], async () => {
      await db.members.put({
        id: 'MEM-CRASH-TEST',
        name: 'Should Not Persist',
        room: '999',
        floor: '9th',
        status: 'Active',
        joiningDate: '2026-11-25',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      // Simulate crash or uncaught error before outbox write completes
      throw new Error('SIMULATED_TRANSACTION_FAILURE');
    });
  } catch (err) {
    if (err.message === 'SIMULATED_TRANSACTION_FAILURE') {
      aborted = true;
    }
  }

  assert(aborted === true, 'Simulated failure triggered transaction abort');
  const ghostRecord = await db.members.get('MEM-CRASH-TEST');
  assert(ghostRecord === undefined, 'Dexie transaction rolled back cleanly; zero ghost records persisted');

  // ===========================================================================
  // TEST GROUP 4: Phase 1.1 Hardening — Concurrency Mutex, Safe IDs & UI Coverage
  // ===========================================================================
  console.log('\n--- TEST GROUP 4: Phase 1.1 Concurrency Mutex, ID Safety & UI Route Coverage ---');

  // Test 4.1: Same-Entity Concurrent Mutations Serialization
  const concurrentMemberId = 'MEM-CONCURRENT-1';
  await db.members.delete(concurrentMemberId);
  await db.sync_outbox.where('entityId').equals(concurrentMemberId).delete();

  // Dispatch 5 concurrent mutations against the exact same entity simultaneously
  const concurrentPromises = [1, 2, 3, 4, 5].map((idx) =>
    DataMutationGateway.saveMember({
      id: concurrentMemberId,
      name: `Concurrent Member Update ${idx}`,
      room: `Room-${idx}`,
      floor: '2nd',
      status: 'Active',
      joiningDate: '2026-11-25',
    })
  );

  const concurrentResults = await Promise.all(concurrentPromises);
  assert(concurrentResults.length === 5, 'All 5 concurrent mutations resolved successfully');

  // Verify versions are strictly monotonic and sequential
  const versions = concurrentResults.map((r) => r.entity._version).sort((a, b) => a - b);
  assert(
    JSON.stringify(versions) === JSON.stringify([1, 2, 3, 4, 5]),
    `Concurrent versions strictly sequenced: ${versions.join(', ')}`
  );

  const finalMember = await db.members.get(concurrentMemberId);
  assert(finalMember._version === 5, 'Final member entity has version 5 in Dexie table');

  const memberOutboxOps = await db.sync_outbox
    .where('entityId')
    .equals(concurrentMemberId)
    .sortBy('localVersion');
  assert(memberOutboxOps.length === 5, '5 separate outbox entries generated for 5 mutations');
  const outboxVersions = memberOutboxOps.map((op) => op.localVersion);
  assert(
    JSON.stringify(outboxVersions) === JSON.stringify([1, 2, 3, 4, 5]),
    `Outbox localVersion sequence strictly monotonic: ${outboxVersions.join(', ')}`
  );

  // Verify Mutex cleanup: Active locks count must return to 0
  assert(getActiveEntityLockCount() === 0, 'Active entity locks map completely cleaned up (0 active)');

  // Test 4.2: Independent Parallel Execution for Different Entities
  const entityA = 'MEM-PARA-A';
  const entityB = 'MEM-PARA-B';
  const [resA, resB] = await Promise.all([
    DataMutationGateway.saveMember({ id: entityA, name: 'Parallel A', room: '101', floor: '1st', status: 'Active', joiningDate: '2026-11-25' }),
    DataMutationGateway.saveMember({ id: entityB, name: 'Parallel B', room: '102', floor: '1st', status: 'Active', joiningDate: '2026-11-25' }),
  ]);
  assert(resA.entity.id === entityA && resB.entity.id === entityB, 'Distinct entities mutated concurrently without interference');
  assert(resA.entity._version === 1 && resB.entity._version === 1, 'Both independent entities initialized to version 1');

  // Test 4.3: Safe ID Generation & Anti-Recycling (Watermark Protection)
  // Seed with MEM-001, MEM-002, and soft-delete MEM-050
  await db.members.bulkPut([
    { id: 'MEM-001', name: 'M1', room: '101', floor: '1st', status: 'Active', joiningDate: '2026-01-01' },
    { id: 'MEM-002', name: 'M2', room: '102', floor: '1st', status: 'Active', joiningDate: '2026-01-01' },
    { id: 'MEM-050', name: 'Deleted M50', room: '105', floor: '1st', status: 'Active', joiningDate: '2026-01-01', _isDeleted: true },
  ]);

  const generatedId = await generateNextMemberId();
  assert(generatedId === 'MEM-051', `generateNextMemberId returned ${generatedId} (prevented recycling MEM-003..MEM-050)`);

  // Test 4.4: UI Gateway Route Coverage — Category
  const catRes = await DataMutationGateway.saveCategory({ id: 'cat-custom-1', name: 'Special Feast' });
  assert(catRes.entity.name === 'Special Feast', 'Category saved through Gateway');
  const catOutbox = await db.sync_outbox.get(catRes.operation.opId);
  assert(catOutbox !== undefined && catOutbox.collectionName === 'categories', 'Category mutation registered in sync_outbox');

  // Test 4.5: UI Gateway Route Coverage — Daily Closures (Save & Soft-Delete)
  const closureDate = '2026-12-25';
  const closureRes = await DataMutationGateway.saveDailyClosure({
    date: closureDate,
    month: '2026-12',
    status: 'FULL_OFF',
    reason: 'Christmas Holiday',
    updatedAt: Date.now(),
  });
  assert(closureRes.entity.status === 'FULL_OFF', 'DailyClosure saved through Gateway');
  const closureOutbox = await db.sync_outbox.get(closureRes.operation.opId);
  assert(closureOutbox !== undefined && closureOutbox.collectionName === 'dailyClosures', 'Closure mutation registered in sync_outbox');

  const delClosureRes = await DataMutationGateway.deleteDailyClosure(closureDate);
  assert(delClosureRes.entity._isDeleted === true, 'DailyClosure soft-deleted through Gateway');
  const delClosureOutbox = await db.sync_outbox.get(delClosureRes.operation.opId);
  assert(delClosureOutbox.operationType === 'SOFT_DELETE', 'DailyClosure soft-delete registered in sync_outbox');

  // Test 4.6: UI Gateway Route Coverage — Manager Assignment (Save & Resignation)
  const mgrId = 'MGR-TEST-TENURE-01';
  const mgrRes = await DataMutationGateway.saveManager({
    id: mgrId,
    name: 'Test Manager 2026',
    startDate: '2026-12-01',
    endDate: null,
    status: 'Active',
    notes: 'Testing tenure',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  assert(mgrRes.entity.name === 'Test Manager 2026', 'Manager period saved through Gateway');
  const mgrOutbox = await db.sync_outbox.get(mgrRes.operation.opId);
  assert(mgrOutbox !== undefined && mgrOutbox.collectionName === 'managers', 'Manager mutation registered in sync_outbox');

  const resignMgrRes = await DataMutationGateway.deleteManager(mgrId);
  assert(resignMgrRes.entity.status === 'Resigned', 'Manager resignation marked Resigned');
  assert(resignMgrRes.entity._isDeleted === true, 'Manager resignation soft-deleted through Gateway');
  const resignMgrOutbox = await db.sync_outbox.get(resignMgrRes.operation.opId);
  assert(resignMgrOutbox.operationType === 'SOFT_DELETE', 'Manager resignation registered in sync_outbox as SOFT_DELETE');

  // Test 4.7: UI Gateway Route Coverage — Settings Update
  const settingsRes = await DataMutationGateway.updateSettings({ messName: 'Hardened Mess 2026' });
  assert(settingsRes.entity.messName === 'Hardened Mess 2026', 'Settings updated through Gateway');
  const settingsOutbox = await db.sync_outbox.get(settingsRes.operation.opId);
  assert(settingsOutbox !== undefined && settingsOutbox.collectionName === 'settings', 'Settings update registered in sync_outbox');

  // Cleanup test artifacts
  await db.members.bulkDelete([concurrentMemberId, entityA, entityB, 'MEM-050']);
  await db.categories.delete('cat-custom-1');
  await db.dailyClosures.delete(closureDate);
  await db.managers.delete(mgrId);
  await db.sync_outbox.clear();

  // ===========================================================================
  // TEST GROUP 5: Phase 1.2 — Atomic ID Allocation & Bulk Meal Concurrency
  // ===========================================================================
  console.log('\n--- TEST GROUP 5: Phase 1.2 Atomic ID Allocation & Bulk Meal Concurrency ---');

  // Test 5.1: Concurrent Member Creation via Promise.all (Collision Prevention)
  console.log('  Testing simultaneous member creation requests...');
  // Seed initial counter to 100 for clean testing
  await db.sequence_counters.put({ id: 'member_id', lastValue: 100, updatedAt: Date.now() });

  const creationPromises = [1, 2, 3, 4, 5].map((idx) =>
    DataMutationGateway.createMember({
      name: `Parallel Member ${idx}`,
      room: `Room-10${idx}`,
      floor: '1st',
      status: 'Active',
      joiningDate: '2026-11-25',
    })
  );

  const creationResults = await Promise.all(creationPromises);
  assert(creationResults.length === 5, 'All 5 concurrent member creations resolved successfully');

  const allocatedIds = creationResults.map((r) => r.entity.id);
  const uniqueIds = new Set(allocatedIds);
  assert(uniqueIds.size === 5, `All 5 allocated IDs are unique (No duplicate IDs): ${allocatedIds.join(', ')}`);

  const expectedIds = ['MEM-101', 'MEM-102', 'MEM-103', 'MEM-104', 'MEM-105'];
  const sortedAllocatedIds = [...allocatedIds].sort();
  assert(
    JSON.stringify(sortedAllocatedIds) === JSON.stringify(expectedIds),
    `IDs strictly sequential and monotonic: ${sortedAllocatedIds.join(', ')}`
  );

  for (const res of creationResults) {
    const mem = await db.members.get(res.entity.id);
    assert(mem !== undefined && mem.name.startsWith('Parallel Member'), `Member ${res.entity.id} verified in members table without overwrite`);
    assert(mem._version === 1, `Member ${res.entity.id} version initialized to 1`);
    const outbox = await db.sync_outbox.get(res.operation.opId);
    assert(outbox !== undefined && outbox.entityId === res.entity.id, `Outbox operation created for ${res.entity.id}`);
  }

  // Check sequence counter matches highest allocated
  const postCreateCounter = await db.sequence_counters.get('member_id');
  assert(postCreateCounter.lastValue === 105, `Durable sequence counter advanced to 105: ${postCreateCounter.lastValue}`);

  // Test 5.2: Insert-Only Semantics & Collision Rejection
  console.log('  Testing insert-only semantics on duplicate ID...');
  let collisionErrorThrown = false;
  try {
    // Attempt to create member using an ID that already exists
    await DataMutationGateway.createMember({
      id: 'MEM-101',
      name: 'Collision Attacker',
      room: 'Malicious-Room',
      floor: '1st',
      status: 'Active',
      joiningDate: '2026-11-25',
    });
  } catch (err) {
    if (err.message && err.message.includes('MEMBER_ID_COLLISION')) {
      collisionErrorThrown = true;
    }
  }
  assert(collisionErrorThrown === true, 'Insert collision rejected with MEMBER_ID_COLLISION error');

  // Verify existing member data was NOT overwritten
  const uncorruptedMember = await db.members.get('MEM-101');
  assert(uncorruptedMember.name !== 'Collision Attacker', 'Original member was NOT silently overwritten');

  // Test 5.3: Sequence Counter Permanence Independent of Physical Rows
  console.log('  Testing sequence counter permanence independent of physical rows...');
  // Soft delete highest member (MEM-105)
  await DataMutationGateway.deleteMember('MEM-105');
  const deletedMem = await db.members.get('MEM-105');
  assert(deletedMem._isDeleted === true, 'MEM-105 soft-deleted');

  // Next allocation must NOT reuse MEM-105
  const postDeleteMember = await DataMutationGateway.createMember({
    name: 'Post Delete Member',
    room: 'Room-201',
    floor: '2nd',
    status: 'Active',
    joiningDate: '2026-11-25',
  });
  assert(postDeleteMember.entity.id === 'MEM-106', `Allocated MEM-106 (did not recycle deleted MEM-105)`);

  // Now physically wipe all members from members table (simulate hard cleanup)
  await db.members.clear();
  const emptyCount = await db.members.count();
  assert(emptyCount === 0, 'Physically emptied members table');

  // Counter must remain at 106 in sequence_counters table
  const counterAfterWipe = await db.sequence_counters.get('member_id');
  assert(counterAfterWipe.lastValue === 106, `Durable counter retained at 106 even after physical members wipe`);

  // Next creation must allocate MEM-107 (permanence verified)
  const afterWipeMember = await DataMutationGateway.createMember({
    name: 'After Wipe Member',
    room: 'Room-301',
    floor: '3rd',
    status: 'Active',
    joiningDate: '2026-11-25',
  });
  assert(afterWipeMember.entity.id === 'MEM-107', `Allocated MEM-107, permanently preventing sequence regression`);

  // Test 5.4: Transaction Rollback on Failed Member Creation
  console.log('  Testing atomic rollback on failed member creation...');
  let creationRollbackTested = false;
  try {
    await db.transaction('rw', [db.members, db.sequence_counters, db.sync_outbox], async () => {
      await db.members.add({
        id: 'MEM-TEMP-FAIL',
        name: 'Failed Member',
        room: '999',
        floor: '9th',
        status: 'Active',
        joiningDate: '2026-11-25',
      });
      await db.sequence_counters.put({ id: 'member_id', lastValue: 999, updatedAt: Date.now() });
      throw new Error('SIMULATED_MEMBER_CREATION_FAILURE');
    });
  } catch (err) {
    if (err.message === 'SIMULATED_MEMBER_CREATION_FAILURE') {
      creationRollbackTested = true;
    }
  }
  assert(creationRollbackTested === true, 'Member creation failure aborted transaction');
  const ghostMember = await db.members.get('MEM-TEMP-FAIL');
  assert(ghostMember === undefined, 'No ghost member persisted after rollback');
  const preservedCounter = await db.sequence_counters.get('member_id');
  assert(preservedCounter.lastValue === 107, 'Sequence counter rolled back cleanly to 107 (did not leak 999)');

  // Test 5.5: Bulk Meal Mutation Concurrency & Predecessor Version Accounting
  console.log('  Testing bulk meal mutation concurrency & version sequencing...');
  const mealId1 = 'MEM-101_2026-12-01';
  const mealId2 = 'MEM-102_2026-12-01';
  await db.mealEntries.bulkDelete([mealId1, mealId2]);
  await db.sync_outbox.where('entityId').equals(mealId1).delete();
  await db.sync_outbox.where('entityId').equals(mealId2).delete();

  // 1. Initial single meal save on mealId1
  const singleMealRes = await DataMutationGateway.saveMealEntry({
    id: mealId1,
    memberId: 'MEM-101',
    date: '2026-12-01',
    month: '2026-12',
    count: 1,
    type: 'ON',
    updatedAt: Date.now(),
  });
  assert(singleMealRes.entity._version === 1, 'Single meal initial version is 1');
  assert(singleMealRes.operation.localVersion === 1, 'Single meal outbox localVersion is 1');

  // 2. Bulk meal save containing BOTH mealId1 (successor) and mealId2 (initial)
  const bulkRes = await DataMutationGateway.saveMealEntriesBulk([
    { id: mealId1, memberId: 'MEM-101', date: '2026-12-01', month: '2026-12', count: 2, type: 'Double', updatedAt: Date.now() },
    { id: mealId2, memberId: 'MEM-102', date: '2026-12-01', month: '2026-12', count: 1, type: 'ON', updatedAt: Date.now() },
  ]);
  assert(bulkRes.length === 2, 'Bulk meal save returned 2 entries');

  const updatedMeal1 = await db.mealEntries.get(mealId1);
  assert(updatedMeal1._version === 2, `Meal1 version incremented to 2 in bulk save: ${updatedMeal1._version}`);

  const updatedMeal2 = await db.mealEntries.get(mealId2);
  assert(updatedMeal2._version === 1, `Meal2 version initialized to 1 in bulk save: ${updatedMeal2._version}`);

  // Inspect outbox for mealId1: must have 2 operations with localVersion 1 and 2
  const meal1Ops = await db.sync_outbox
    .where('entityId')
    .equals(mealId1)
    .sortBy('localVersion');
  assert(meal1Ops.length === 2, '2 outbox ops for mealId1');
  assert(meal1Ops[0].localVersion === 1 && meal1Ops[0].prevEntityVersion === 0, 'Op 1: prev=0, local=1');
  assert(meal1Ops[1].localVersion === 2 && meal1Ops[1].prevEntityVersion === 1, 'Op 2: prev=1, local=2 (Correct predecessor sequencing in bulk save)');

  // 3. Concurrent overlapping bulk operations
  console.log('  Testing concurrent overlapping bulk meal operations...');
  const mealId3 = 'MEM-103_2026-12-01';
  const bulkA_Promises = DataMutationGateway.saveMealEntriesBulk([
    { id: mealId1, memberId: 'MEM-101', date: '2026-12-01', month: '2026-12', count: 1, type: 'ON', updatedAt: Date.now() },
    { id: mealId2, memberId: 'MEM-102', date: '2026-12-01', month: '2026-12', count: 2, type: 'Double', updatedAt: Date.now() },
  ]);
  const bulkB_Promises = DataMutationGateway.saveMealEntriesBulk([
    { id: mealId2, memberId: 'MEM-102', date: '2026-12-01', month: '2026-12', count: 0, type: 'OFF', updatedAt: Date.now() },
    { id: mealId3, memberId: 'MEM-103', date: '2026-12-01', month: '2026-12', count: 1, type: 'ON', updatedAt: Date.now() },
  ]);

  const [resBulkA, resBulkB] = await Promise.all([bulkA_Promises, bulkB_Promises]);
  assert(resBulkA.length === 2 && resBulkB.length === 2, 'Overlapping concurrent bulk operations resolved with zero deadlocks');

  // Verify mealId2 received two sequential increments (versions 2 and 3)
  const finalMeal2 = await db.mealEntries.get(mealId2);
  assert(finalMeal2._version === 3, `Overlapping meal2 reached version 3: ${finalMeal2._version}`);

  const meal2Ops = await db.sync_outbox
    .where('entityId')
    .equals(mealId2)
    .sortBy('localVersion');
  assert(meal2Ops.length === 3, '3 outbox ops generated for mealId2');
  const meal2Versions = meal2Ops.map((o) => o.localVersion);
  assert(
    JSON.stringify(meal2Versions) === JSON.stringify([1, 2, 3]),
    `Outbox versions strictly sequential [1, 2, 3]: ${meal2Versions.join(', ')}`
  );

  // Clean up test items
  await db.members.bulkDelete(['MEM-101', 'MEM-102', 'MEM-103', 'MEM-104', 'MEM-105', 'MEM-106', 'MEM-107']);
  await db.mealEntries.bulkDelete([mealId1, mealId2, mealId3]);
  await db.sync_outbox.clear();

  // ===========================================================================
  // SUMMARY
  // ===========================================================================
  console.log('\n========================================================================');
  console.log(`PHASE 1 VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase1Tests().catch((err) => {
  console.error('Test runner encountered an error:', err);
  process.exit(1);
});
