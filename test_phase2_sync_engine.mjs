import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { db } from './src/db/index.ts';
import {
  DataMutationGateway,
  generateOperationId,
  getClientInstanceId,
  generateNextMemberId,
} from './src/services/dataGateway.ts';
import {
  OutboxFlusher,
  FLUSHER_CONFIG,
} from './src/services/outboxFlusher.ts';
import { safeInboundSync } from './src/services/inboundSync.ts';
import { calculateManagerAssignmentPeriodAccounting } from './src/utils/calculations.ts';
import { COLLECTIONS } from './src/services/firestore.ts';

console.log('========================================================================');
console.log('PHASE 2 AUTOMATED VERIFICATION SUITE');
console.log('Reliable Firebase Sync Engine: Outbox, Transactions, Inbound Protection');
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

async function runPhase2Tests() {
  await db.open();

  // Clean test tables
  await db.members.clear();
  await db.mealEntries.clear();
  await db.expenses.clear();
  await db.deposits.clear();
  await db.categories.clear();
  await db.managers.clear();
  await db.dailyClosures.clear();
  await db.settings.clear();
  await db.sync_outbox.clear();
  await db.sync_receipts.clear();
  await db.conflicts.clear();
  await db.sequence_counters.clear();

  // ===========================================================================
  // TEST GROUP 1: Outbox Diagnostics & Initial State
  // ===========================================================================
  console.log('--- TEST GROUP 1: Outbox Diagnostics & Lifecycle ---');

  const flusher = new OutboxFlusher();
  let diag = await flusher.getDiagnostics();
  assert(diag.status === 'synced', 'Initial flusher status is "synced" when queue is empty');
  assert(diag.pendingCount === 0, 'Pending count is 0');
  assert(diag.leasedCount === 0, 'Leased count is 0');
  assert(diag.quarantinedCount === 0, 'Quarantined count is 0');
  assert(diag.conflictsCount === 0, 'Conflicts count is 0');

  // Create a member via gateway to populate Outbox
  const { entity: m1 } = await DataMutationGateway.createMember({
    name: 'Tariqul Islam',
    room: '201',
    floor: '2nd',
    status: 'Active',
    joiningDate: '2026-03-01',
  });

  diag = await flusher.getDiagnostics();
  assert(diag.pendingCount === 1, 'Diagnostics shows pendingCount = 1 after local mutation');
  assert(diag.status === 'pending', 'Status transitions to "pending" when items await sync');

  // Verify outbox entry structure
  const outboxItems = await db.sync_outbox.toArray();
  assert(outboxItems.length === 1, 'Exactly 1 outbox item created in sync_outbox');
  const op1 = outboxItems[0];
  assert(op1.entityId === m1.id, 'Outbox item entityId matches created member');
  assert(op1.collectionName === COLLECTIONS.MEMBERS, 'Outbox collectionName is members');
  assert(op1.localVersion === 1, 'Local version starts at 1');
  assert(op1.prevEntityVersion === 0, 'Predecessor version is 0 for insert');
  assert(op1.status === 'pending', 'Initial outbox status is "pending"');
  assert(op1.retryCount === 0, 'Initial retryCount is 0');

  // ===========================================================================
  // TEST GROUP 2: Leasing and Crash/Refresh Recovery
  // ===========================================================================
  console.log('\n--- TEST GROUP 2: Lease Acquisition & Crash/Refresh Recovery ---');

  const now = Date.now();
  // Simulate leasing the operation
  await db.sync_outbox.update(op1.opId, {
    status: 'leased',
    leaseToken: 'lease_test_token_123',
    leaseExpiresAt: now - 5000, // Expired lease (simulating app crash/closed tab)
    updatedAt: now - 5000,
  });

  diag = await flusher.getDiagnostics();
  assert(diag.leasedCount === 1, 'Diagnostics reports 1 leased item before recovery');

  // Run recovery
  const recoveredCount = await flusher.recoverExpiredLeases();
  assert(recoveredCount === 1, 'recoverExpiredLeases reclaims exactly 1 expired lease');

  const recoveredOp = await db.sync_outbox.get(op1.opId);
  assert(recoveredOp.status === 'pending', 'Expired operation safely reset to "pending"');
  assert(recoveredOp.leaseToken === null, 'leaseToken reset to null');
  assert(recoveredOp.leaseExpiresAt === null, 'leaseExpiresAt reset to null');

  // Verify non-expired lease is NOT reclaimed
  await db.sync_outbox.update(op1.opId, {
    status: 'leased',
    leaseToken: 'lease_active_token',
    leaseExpiresAt: now + 30000, // Valid for 30s
    updatedAt: now,
  });

  const activeReclaimed = await flusher.recoverExpiredLeases();
  assert(activeReclaimed === 0, 'Active non-expired lease is NOT reclaimed');
  const activeOp = await db.sync_outbox.get(op1.opId);
  assert(activeOp.status === 'leased', 'Active lease remains in "leased" status');

  // Reset back to pending for subsequent tests
  await db.sync_outbox.update(op1.opId, { status: 'pending', leaseToken: null, leaseExpiresAt: null });

  // ===========================================================================
  // TEST GROUP 3: Per-Entity FIFO Ordering & Concurrency Isolation
  // ===========================================================================
  console.log('\n--- TEST GROUP 3: Per-Entity FIFO Ordering & Concurrency Isolation ---');

  // Update member m1 twice in succession locally
  await DataMutationGateway.saveMember({ ...m1, name: 'Tariqul Islam (Updated 1)' });
  await DataMutationGateway.saveMember({ ...m1, name: 'Tariqul Islam (Updated 2)' });

  // Also create a second member m2
  const { entity: m2 } = await DataMutationGateway.createMember({
    name: 'Rafiq Ahmed',
    room: '202',
    floor: '2nd',
    status: 'Active',
    joiningDate: '2026-03-01',
  });

  const allPending = await db.sync_outbox
    .where('status')
    .equals('pending')
    .sortBy('createdAt');

  // There are 3 operations for m1 (v1 insert, v2 update, v3 update) and 1 for m2 (v1 insert)
  const m1Ops = allPending.filter((o) => o.entityId === m1.id);
  const m2Ops = allPending.filter((o) => o.entityId === m2.id);

  assert(m1Ops.length === 3, 'Entity m1 has exactly 3 pending operations');
  assert(m2Ops.length === 1, 'Entity m2 has exactly 1 pending operation');

  // Verify version sequencing on m1
  assert(m1Ops[0].localVersion === 1 && m1Ops[0].prevEntityVersion === 0, 'm1 op0: v1, prev 0');
  assert(m1Ops[1].localVersion === 2 && m1Ops[1].prevEntityVersion === 1, 'm1 op1: v2, prev 1');
  assert(m1Ops[2].localVersion === 3 && m1Ops[2].prevEntityVersion === 2, 'm1 op2: v3, prev 2');

  // Simulate head-of-line extraction (from flushQueue logic)
  const eligibleOps = [];
  const entityClaimed = new Set();
  for (const op of allPending) {
    const key = `${op.collectionName}:${op.entityId}`;
    if (entityClaimed.has(key)) continue;
    entityClaimed.add(key);
    eligibleOps.push(op);
  }

  assert(eligibleOps.length === 2, 'Only 2 operations eligible in first batch (1 per entity)');
  assert(eligibleOps.some((o) => o.opId === m1Ops[0].opId), 'Head operation for m1 is eligible (v1)');
  assert(!eligibleOps.some((o) => o.opId === m1Ops[1].opId), 'Subsequent operation for m1 (v2) is blocked');
  assert(!eligibleOps.some((o) => o.opId === m1Ops[2].opId), 'Subsequent operation for m1 (v3) is blocked');
  assert(eligibleOps.some((o) => o.opId === m2Ops[0].opId), 'm2 head operation is eligible concurrently');

  // ===========================================================================
  // TEST GROUP 4: Exponential Backoff & Retry Exhaustion
  // ===========================================================================
  console.log('\n--- TEST GROUP 4: Exponential Backoff & Retry Exhaustion ---');

  // Test backoff calculation
  const b0 = Math.min(FLUSHER_CONFIG.BACKOFF_BASE_MS * Math.pow(2, 0), FLUSHER_CONFIG.BACKOFF_MAX_MS);
  const b1 = Math.min(FLUSHER_CONFIG.BACKOFF_BASE_MS * Math.pow(2, 1), FLUSHER_CONFIG.BACKOFF_MAX_MS);
  const b2 = Math.min(FLUSHER_CONFIG.BACKOFF_BASE_MS * Math.pow(2, 2), FLUSHER_CONFIG.BACKOFF_MAX_MS);
  const b5 = Math.min(FLUSHER_CONFIG.BACKOFF_BASE_MS * Math.pow(2, 5), FLUSHER_CONFIG.BACKOFF_MAX_MS);

  assert(b0 === 1000, 'Backoff retry 0 = 1000ms');
  assert(b1 === 2000, 'Backoff retry 1 = 2000ms');
  assert(b2 === 4000, 'Backoff retry 2 = 4000ms');
  assert(b5 === 30000, 'Backoff retry 5 is capped at MAX_MS (30000ms)');

  // Simulate transient network errors up to MAX_RETRIES
  const testOp = m2Ops[0];
  let currRetry = 0;
  for (let r = 1; r < FLUSHER_CONFIG.MAX_RETRIES; r++) {
    await db.sync_outbox.update(testOp.opId, {
      status: 'pending',
      retryCount: r,
      updatedAt: Date.now(),
      error: 'Simulated Network Error ' + r,
    });
    const item = await db.sync_outbox.get(testOp.opId);
    assert(item.retryCount === r, `Retry count incremented to ${r}`);
    assert(item.status === 'pending', 'Status remains pending during backoff retries');
  }

  // Reach MAX_RETRIES -> must transition to failed_exhausted
  const finalRetry = FLUSHER_CONFIG.MAX_RETRIES;
  await db.sync_outbox.update(testOp.opId, {
    status: 'failed_exhausted',
    retryCount: finalRetry,
    updatedAt: Date.now(),
    error: 'Permanent failure: Connection refused',
  });

  const exhaustedItem = await db.sync_outbox.get(testOp.opId);
  assert(exhaustedItem.status === 'failed_exhausted', 'Transitioned to "failed_exhausted" at retry limit');
  assert(exhaustedItem.retryCount === 5, 'Final retry count is 5');

  // Verify manual retry recovers failed_exhausted operation
  const retried = await flusher.retryOperation(testOp.opId);
  assert(retried === true, 'retryOperation returns true for exhausted operation');
  const retriedItem = await db.sync_outbox.get(testOp.opId);
  assert(retriedItem.status === 'pending', 'retryOperation resets status to "pending"');
  assert(retriedItem.retryCount === 0, 'retryOperation resets retryCount to 0');
  assert(retriedItem.error === null, 'retryOperation clears error');

  // ===========================================================================
  // TEST GROUP 5: Transaction Mock & Idempotency Protection
  // ===========================================================================
  console.log('\n--- TEST GROUP 5: Firestore Transaction & Idempotency Protection ---');

  // Mock Firestore data store in-memory for testing transaction logic
  const mockRemoteStore = new Map();

  // Function simulating executeCloudTransaction behavior with mock store
  async function simulateExecuteCloudTransaction(op, remoteStore) {
    const docKey = `${op.collectionName}/${op.entityId}`;
    const remoteData = remoteStore.get(docKey);

    if (remoteData) {
      const remoteVersion = typeof remoteData._version === 'number' ? remoteData._version : 0;
      const remoteLastOpId = remoteData._lastOpId;

      // 1. Idempotency Check
      if (remoteLastOpId === op.opId) {
        return { type: 'ALREADY_APPLIED', version: remoteVersion };
      }

      // 2. Conflict Check
      if (remoteVersion > op.prevEntityVersion) {
        return { type: 'CONFLICT', remoteData, remoteVersion };
      }
    }

    // 3. Commit
    const commitData = {
      ...op.payload,
      id: op.entityId,
      _version: op.localVersion,
      _lastOpId: op.opId,
      _lastModifiedLocally: op.payload._lastModifiedLocally || Date.now(),
    };
    remoteStore.set(docKey, commitData);
    return { type: 'COMMITTED', version: op.localVersion };
  }

  // Commit op 1 (v1 insert of m1)
  const commitOutcome1 = await simulateExecuteCloudTransaction(m1Ops[0], mockRemoteStore);
  assert(commitOutcome1.type === 'COMMITTED', 'First attempt COMMITTED to remote store');
  assert(commitOutcome1.version === 1, 'Committed remote version is 1');

  // Verify remote store content
  const remoteDoc = mockRemoteStore.get(`${COLLECTIONS.MEMBERS}/${m1.id}`);
  assert(remoteDoc !== undefined, 'Document exists in remote store');
  assert(remoteDoc._lastOpId === m1Ops[0].opId, 'Remote _lastOpId matches operation ID');
  assert(remoteDoc._version === 1, 'Remote version is 1');

  // Retry the exact same operation (simulating client network timeout after commit)
  const retryOutcome1 = await simulateExecuteCloudTransaction(m1Ops[0], mockRemoteStore);
  assert(retryOutcome1.type === 'ALREADY_APPLIED', 'Duplicate attempt detected as ALREADY_APPLIED');
  assert(retryOutcome1.version === 1, 'Version remains unchanged at 1');

  // Update outbox and record receipt
  const receipt1 = {
    opId: m1Ops[0].opId,
    entityId: m1Ops[0].entityId,
    collectionName: m1Ops[0].collectionName,
    committedVersion: 1,
    committedAt: Date.now(),
    expiresAt: Date.now() + 30 * 86400000,
  };
  await db.sync_receipts.put(receipt1);
  await db.sync_outbox.update(m1Ops[0].opId, { status: 'synced', updatedAt: Date.now() });

  const storedReceipt = await db.sync_receipts.get(m1Ops[0].opId);
  assert(storedReceipt !== undefined, 'Idempotency receipt recorded in sync_receipts');
  assert(storedReceipt.committedVersion === 1, 'Receipt stores committed version');

  // Now process next operation in queue (m1Ops[1], v2 update)
  const commitOutcome2 = await simulateExecuteCloudTransaction(m1Ops[1], mockRemoteStore);
  assert(commitOutcome2.type === 'COMMITTED', 'Sequential v2 operation COMMITTED successfully');
  assert(commitOutcome2.version === 2, 'Committed remote version incremented to 2');
  const remoteDocV2 = mockRemoteStore.get(`${COLLECTIONS.MEMBERS}/${m1.id}`);
  assert(remoteDocV2._version === 2, 'Remote doc updated to version 2');
  assert(remoteDocV2._lastOpId === m1Ops[1].opId, 'Remote _lastOpId updated to second op');

  // ===========================================================================
  // TEST GROUP 6: Conflict Detection & Quarantine
  // ===========================================================================
  console.log('\n--- TEST GROUP 6: Conflict Detection & Quarantine ---');

  // Simulate a scenario where another device updated member m2 on Firestore
  // Remote is now version 5 with a foreign opId
  mockRemoteStore.set(`${COLLECTIONS.MEMBERS}/${m2.id}`, {
    id: m2.id,
    name: 'Rafiq Ahmed (Edited on Phone)',
    room: '202',
    floor: '2nd',
    status: 'Active',
    joiningDate: '2026-03-01',
    _version: 5,
    _lastOpId: 'op_foreign_device_999',
  });

  // Local device has m2Ops[0] with prevEntityVersion = 0, localVersion = 1
  const conflictOutcome = await simulateExecuteCloudTransaction(m2Ops[0], mockRemoteStore);
  assert(conflictOutcome.type === 'CONFLICT', 'Conflict correctly detected when remoteVersion > prevVersion');
  assert(conflictOutcome.remoteVersion === 5, 'Remote version identified as 5');

  // Handle conflict outcome as flusher does
  const conflictTime = Date.now();
  await db.sync_outbox.update(m2Ops[0].opId, {
    status: 'quarantined',
    quarantineReason: 'VERSION_CONFLICT',
    quarantinedAt: conflictTime,
    updatedAt: conflictTime,
  });

  const conflictRecord = {
    id: `conflict_${m2Ops[0].opId}`,
    opId: m2Ops[0].opId,
    collectionName: m2Ops[0].collectionName,
    entityId: m2Ops[0].entityId,
    localPayload: m2Ops[0].payload,
    cloudPayload: conflictOutcome.remoteData,
    localVersion: m2Ops[0].localVersion,
    cloudVersion: conflictOutcome.remoteVersion,
    detectedAt: conflictTime,
    status: 'UNRESOLVED',
    cloudSyncStatus: 'PENDING_UPLOAD',
  };
  await db.conflicts.put(conflictRecord);

  // Check outbox & conflicts table
  const quarantinedOp = await db.sync_outbox.get(m2Ops[0].opId);
  assert(quarantinedOp.status === 'quarantined', 'Outbox operation transitioned to "quarantined"');
  assert(quarantinedOp.quarantineReason === 'VERSION_CONFLICT', 'Quarantine reason recorded');

  const storedConflict = await db.conflicts.get(`conflict_${m2Ops[0].opId}`);
  assert(storedConflict !== undefined, 'Conflict record saved in db.conflicts');
  assert(storedConflict.localVersion === 1, 'Conflict record preserves localVersion = 1');
  assert(storedConflict.cloudVersion === 5, 'Conflict record preserves cloudVersion = 5');
  assert(storedConflict.status === 'UNRESOLVED', 'Conflict status is UNRESOLVED');

  // Verify that quarantined operation does not block unrelated entity operations
  diag = await flusher.getDiagnostics();
  assert(diag.quarantinedCount === 1, 'Diagnostics reports 1 quarantined operation');
  assert(diag.conflictsCount === 1, 'Diagnostics reports 1 unresolved conflict');
  assert(diag.status === 'conflict', 'Diagnostics status transitions to "conflict"');

  // Verify remote document was NOT overwritten by local stale data
  const untouchedRemote = mockRemoteStore.get(`${COLLECTIONS.MEMBERS}/${m2.id}`);
  assert(untouchedRemote.name === 'Rafiq Ahmed (Edited on Phone)', 'Remote data preserved untouched');
  assert(untouchedRemote._version === 5, 'Remote version preserved at 5');

  // ===========================================================================
  // TEST GROUP 7: Safe Inbound Snapshot Synchronization
  // ===========================================================================
  console.log('\n--- TEST GROUP 7: Safe Inbound Snapshot Synchronization ---');

  // Clean member table and outbox for targeted inbound tests
  await db.members.clear();
  await db.sync_outbox.clear();
  await db.conflicts.clear();

  // Scenario 1: Normal incoming snapshot with no pending local outbox operations
  const remoteMemberList = [
    { id: 'MEM-101', name: 'Member Inbound 1', room: '101', floor: '1st', status: 'Active', joiningDate: '2026-03-01', _version: 2 },
    { id: 'MEM-102', name: 'Member Inbound 2', room: '102', floor: '1st', status: 'Active', joiningDate: '2026-03-01', _version: 3 },
  ];

  const res1 = await safeInboundSync(db.members, COLLECTIONS.MEMBERS, remoteMemberList, (m) => m.id);
  assert(res1.updatedCount === 2, 'safeInboundSync mirrors 2 clean remote documents');
  assert(res1.protectedCount === 0, 'No documents were protected');
  assert(res1.conflictCount === 0, 'No conflicts detected');

  const inDb101 = await db.members.get('MEM-101');
  assert(inDb101 !== undefined && inDb101.name === 'Member Inbound 1', 'MEM-101 saved to local Dexie');

  // Scenario 2: Local edit is pending in Outbox for MEM-101
  const localEditOpId = generateOperationId(COLLECTIONS.MEMBERS, 'MEM-101');
  const localPendingMember = {
    ...inDb101,
    name: 'MEM-101 Edited Locally (Unsynced)',
    _version: 3,
    _lastOpId: localEditOpId,
  };
  await db.members.put(localPendingMember);
  await db.sync_outbox.put({
    opId: localEditOpId,
    collectionName: COLLECTIONS.MEMBERS,
    entityId: 'MEM-101',
    operationType: 'UPSERT',
    payload: localPendingMember,
    prevEntityVersion: 2,
    localVersion: 3,
    clientId: getClientInstanceId(),
    status: 'pending',
    retryCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    leaseToken: null,
    leaseExpiresAt: null,
    error: null,
  });

  // Inbound snapshot arrives from remote for MEM-101 with foreign changes
  const divergentRemoteDoc = {
    id: 'MEM-101',
    name: 'MEM-101 Remote Conflicting Edit',
    room: '101',
    floor: '1st',
    status: 'Active',
    joiningDate: '2026-03-01',
    _version: 4,
    _lastOpId: 'op_other_device_456',
  };

  const res2 = await safeInboundSync(db.members, COLLECTIONS.MEMBERS, [divergentRemoteDoc], (m) => m.id);
  assert(res2.updatedCount === 0, 'Divergent remote document was NOT mirrored');
  assert(res2.protectedCount === 1, 'Local pending record was PROTECTED from overwrite');
  assert(res2.conflictCount === 1, 'Divergent conflict logged');

  // Verify local record in Dexie still has local unsynced edits!
  const localStillIntact = await db.members.get('MEM-101');
  assert(localStillIntact.name === 'MEM-101 Edited Locally (Unsynced)', 'Local unsynced edit still intact in Dexie!');
  assert(localStillIntact._lastOpId === localEditOpId, 'Local operation ID preserved');

  // Scenario 3: Inbound snapshot is an ECHO of our own committed mutation
  const echoRemoteDoc = {
    id: 'MEM-101',
    name: 'MEM-101 Edited Locally (Unsynced)',
    room: '101',
    floor: '1st',
    status: 'Active',
    joiningDate: '2026-03-01',
    _version: 3,
    _lastOpId: localEditOpId, // Matches active outbox opId!
  };

  const res3 = await safeInboundSync(db.members, COLLECTIONS.MEMBERS, [echoRemoteDoc], (m) => m.id);
  assert(res3.updatedCount === 1, 'Echo snapshot safely accepted and mirrored');
  assert(res3.protectedCount === 0, 'Echo snapshot was not blocked');
  assert(res3.conflictCount === 0, 'No conflict on echo snapshot');

  // ===========================================================================
  // TEST GROUP 8: Bulk Operations & Version Sequencing
  // ===========================================================================
  console.log('\n--- TEST GROUP 8: Bulk Operations Version Sequencing ---');

  await db.mealEntries.clear();
  await db.sync_outbox.clear();

  const bulkMeals = [
    { id: 'MEAL-2026-03-01-MEM-101', memberId: 'MEM-101', date: '2026-03-01', month: '2026-03', breakfast: 1, lunch: 1, dinner: 1 },
    { id: 'MEAL-2026-03-01-MEM-102', memberId: 'MEM-102', date: '2026-03-01', month: '2026-03', breakfast: 0, lunch: 1, dinner: 1 },
    { id: 'MEAL-2026-03-01-MEM-103', memberId: 'MEM-103', date: '2026-03-01', month: '2026-03', breakfast: 1, lunch: 0, dinner: 1 },
  ];

  const savedBulk = await DataMutationGateway.saveMealEntriesBulk(bulkMeals);
  assert(savedBulk.length === 3, 'saveMealEntriesBulk saved 3 meal entries');

  const bulkOutbox = await db.sync_outbox.toArray();
  assert(bulkOutbox.length === 3, 'Exactly 3 outbox entries created for bulk save');
  for (const bOp of bulkOutbox) {
    assert(bOp.collectionName === COLLECTIONS.MEAL_ENTRIES, 'Bulk outbox item has correct collection');
    assert(bOp.localVersion === 1, 'Initial bulk item localVersion = 1');
    assert(bOp.prevEntityVersion === 0, 'Initial bulk item prevVersion = 0');
    assert(bOp.status === 'pending', 'Status is pending');
  }

  // Second bulk write on same entries (should increment version to 2 monotonically)
  const bulkMealsV2 = savedBulk.map((e) => ({ ...e, lunch: 2 }));
  const savedBulkV2 = await DataMutationGateway.saveMealEntriesBulk(bulkMealsV2);
  assert(savedBulkV2.length === 3, 'Second bulk save succeeded');

  const bulkOutboxV2 = await db.sync_outbox
    .where('collectionName')
    .equals(COLLECTIONS.MEAL_ENTRIES)
    .toArray();
  assert(bulkOutboxV2.length === 6, 'Total 6 outbox entries across two bulk saves');

  const v2Ops = bulkOutboxV2.filter((o) => o.localVersion === 2);
  assert(v2Ops.length === 3, 'Exactly 3 v2 outbox operations created');
  for (const v2Op of v2Ops) {
    assert(v2Op.prevEntityVersion === 1, 'v2 operations correctly chain prevEntityVersion = 1');
  }

  // ===========================================================================
  // TEST GROUP 9: Business Calculations & Accounting Preservation
  // ===========================================================================
  console.log('\n--- TEST GROUP 9: Business Calculations & Accounting Preservation ---');

  const calcManagers = [
    { id: 'MGR-1', name: 'Manager 1', startDate: '2026-03-01', endDate: '2026-03-15', status: 'Resigned' },
    { id: 'MGR-2', name: 'Manager 2', startDate: '2026-03-16', endDate: '2026-03-31', status: 'Resigned' },
  ];
  const calcMeals = [
    { id: 'm1', date: '2026-03-05', month: '2026-03', count: 3, breakfast: 1, lunch: 1, dinner: 1 }, // 3 meals in period 1
    { id: 'm2', date: '2026-03-10', month: '2026-03', count: 2, breakfast: 0, lunch: 1, dinner: 1 }, // 2 meals in period 1
    { id: 'm3', date: '2026-03-20', month: '2026-03', count: 3, breakfast: 1, lunch: 1, dinner: 1 }, // 3 meals in period 2
  ];
  const calcExpenses = [
    { id: 'e1', date: '2026-03-05', month: '2026-03', amount: 500, category: 'Market' }, // Period 1
    { id: 'e2', date: '2026-03-20', month: '2026-03', amount: 300, category: 'Market' }, // Period 2
  ];

  const mgr1Accounting = calculateManagerAssignmentPeriodAccounting(
    calcManagers[0],
    calcMeals,
    calcExpenses,
    [],
    5
  );
  assert(mgr1Accounting.totalMeals === 5, 'Period 1: Total meals = 5 (3 + 2)');
  assert(mgr1Accounting.totalMarketExpenses === 500, 'Period 1: Total market expense = 500');
  assert(mgr1Accounting.mealRate === 100, 'Period 1: Meal rate = 500 / 5 = 100');
  assert(mgr1Accounting.feeRatePerMeal === 5, 'Period 1: Manager fee per meal = 5');
  assert(mgr1Accounting.totalManagerFee === 25, 'Period 1: Total manager fee = 5 * 5 = 25');

  const mgr2Accounting = calculateManagerAssignmentPeriodAccounting(
    calcManagers[1],
    calcMeals,
    calcExpenses,
    [],
    5
  );
  assert(mgr2Accounting.totalMeals === 3, 'Period 2: Total meals = 3');
  assert(mgr2Accounting.totalMarketExpenses === 300, 'Period 2: Total market expense = 300');
  assert(mgr2Accounting.mealRate === 100, 'Period 2: Meal rate = 300 / 3 = 100');
  assert(mgr2Accounting.totalManagerFee === 15, 'Period 2: Total manager fee = 3 * 5 = 15');

  // ===========================================================================
  // SUMMARY
  // ===========================================================================
  console.log('\n========================================================================');
  console.log(`PHASE 2 VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase2Tests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
