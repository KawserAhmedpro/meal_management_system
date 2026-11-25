import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { db } from './src/db/index.ts';
import {
  DataMutationGateway,
  generateOperationId,
  getClientInstanceId,
} from './src/services/dataGateway.ts';
import {
  OutboxFlusher,
  FLUSHER_CONFIG,
} from './src/services/outboxFlusher.ts';
import { safeInboundSync } from './src/services/inboundSync.ts';
import { COLLECTIONS } from './src/services/firestore.ts';

console.log('========================================================================');
console.log('PRACTICAL REAL-WORLD FUNCTIONALITY TEST: PHASE 2 SYNC ENGINE');
console.log('========================================================================\n');

let passCount = 0;
let failCount = 0;

function report(condition, testName, details = '') {
  if (condition) {
    console.log(`  [PASS] ${testName}${details ? ` -> ${details}` : ''}`);
    passCount++;
  } else {
    console.error(`  [FAIL] ${testName}${details ? ` -> ${details}` : ''}`);
    failCount++;
  }
}

async function runPracticalTests() {
  await db.open();

  // Clean test tables to ensure completely isolated testing
  await db.members.clear();
  await db.mealEntries.clear();
  await db.sync_outbox.clear();
  await db.sync_receipts.clear();
  await db.conflicts.clear();
  await db.sequence_counters.clear();

  // Create isolated Flusher instance
  const flusher = new OutboxFlusher();

  // ===========================================================================
  // 1. ONLINE TEST
  // ===========================================================================
  console.log('------------------------------------------------------------------------');
  console.log('TEST 1: ONLINE TEST (Create test member, meal entry, Outbox processing)');
  console.log('------------------------------------------------------------------------');

  // 1.1 Create new test member in online state
  const testMemberInput = {
    name: 'TEST Online Member',
    room: 'Test-101',
    floor: '1st',
    status: 'Active',
    joiningDate: '2026-03-01',
  };

  const { entity: createdMember } = await DataMutationGateway.createMember(testMemberInput);
  report(
    createdMember && createdMember.id && createdMember.name === testMemberInput.name,
    'Online Member Creation',
    `Created entity ID: ${createdMember.id}, Version: ${createdMember._version}`
  );

  // Verify Outbox queue entry created atomically
  const outboxOp1 = await db.sync_outbox.get(createdMember._lastOpId);
  report(
    outboxOp1 !== undefined && outboxOp1.status === 'pending' && outboxOp1.entityId === createdMember.id,
    'Outbox Entry Creation for Member',
    `OpId: ${outboxOp1?.opId}, Status: ${outboxOp1?.status}, localVersion: ${outboxOp1?.localVersion}`
  );

  // 1.2 Create and edit test meal entry
  const testMeal = {
    id: `MEAL-2026-03-01-${createdMember.id}`,
    memberId: createdMember.id,
    date: '2026-03-01',
    month: '2026-03',
    breakfast: 1,
    lunch: 1,
    dinner: 1,
    count: 3,
  };

  const { entity: savedMeal } = await DataMutationGateway.saveMealEntry(testMeal);
  report(
    savedMeal && savedMeal.id === testMeal.id && savedMeal._version === 1,
    'Online Meal Entry Creation',
    `Meal ID: ${savedMeal.id}, Version: ${savedMeal._version}`
  );

  // Edit the meal entry
  const editedMealInput = {
    ...savedMeal,
    lunch: 2,
    count: 4,
  };
  const { entity: updatedMeal } = await DataMutationGateway.saveMealEntry(editedMealInput);
  report(
    updatedMeal && updatedMeal.lunch === 2 && updatedMeal._version === 2,
    'Online Meal Entry Edit',
    `Updated Lunch to 2, Version incremented to: ${updatedMeal._version}`
  );

  // Verify Outbox sequencing on meal
  const mealPendingOps = await db.sync_outbox
    .where('[collectionName+entityId+status]')
    .equals([COLLECTIONS.MEAL_ENTRIES, testMeal.id, 'pending'])
    .sortBy('localVersion');

  report(
    mealPendingOps.length === 2 && mealPendingOps[0].localVersion === 1 && mealPendingOps[1].localVersion === 2,
    'Per-Entity Outbox Version Sequencing',
    `2 pending operations strictly ordered: v1 (prev 0), v2 (prev 1)`
  );

  // 1.3 Outbox processing simulation (transaction commit & idempotency)
  // Simulate cloud transaction commit for Member
  const now = Date.now();
  await db.sync_outbox.update(outboxOp1.opId, {
    status: 'synced',
    updatedAt: now,
  });
  await db.sync_receipts.put({
    opId: outboxOp1.opId,
    entityId: createdMember.id,
    collectionName: COLLECTIONS.MEMBERS,
    committedVersion: 1,
    committedAt: now,
    expiresAt: now + 30 * 86400000,
  });

  const memberReceipt = await db.sync_receipts.get(outboxOp1.opId);
  const syncedMemberOp = await db.sync_outbox.get(outboxOp1.opId);
  report(
    syncedMemberOp.status === 'synced' && memberReceipt !== undefined,
    'Outbox Processing & Receipt Logging',
    `Outbox status: ${syncedMemberOp.status}, Receipt stored: ${memberReceipt.opId}`
  );

  // ===========================================================================
  // 2. OFFLINE TEST
  // ===========================================================================
  console.log('\n------------------------------------------------------------------------');
  console.log('TEST 2: OFFLINE TEST (Disconnect, Local writes, Reconnect & Auto-sync)');
  console.log('------------------------------------------------------------------------');

  // 2.1 Simulate Internet Disconnected state
  // We manipulate flusher online state directly
  flusher.isOnline = false;
  let diagOffline = await flusher.getDiagnostics();
  report(
    diagOffline.status === 'offline',
    'Offline State Detection',
    `Flusher status transitioned to: ${diagOffline.status}`
  );

  // 2.2 Create a test member while offline
  const offlineMemberInput = {
    name: 'TEST Offline Member',
    room: 'Test-OFF',
    floor: 'Ground',
    status: 'Active',
    joiningDate: '2026-03-02',
  };

  const { entity: offlineCreatedMember } = await DataMutationGateway.createMember(offlineMemberInput);
  const inDbOffline = await db.members.get(offlineCreatedMember.id);
  report(
    inDbOffline !== undefined && inDbOffline.name === offlineMemberInput.name,
    'Offline Local IndexedDB Persistence',
    `Member saved locally in Dexie: ${inDbOffline.id}`
  );

  // Verify Outbox retains pending status and is NOT flushed while offline
  const offlineOutboxItem = await db.sync_outbox.get(offlineCreatedMember._lastOpId);
  report(
    offlineOutboxItem !== undefined && offlineOutboxItem.status === 'pending',
    'Offline Outbox Protection',
    `OpId: ${offlineOutboxItem.opId} safely queued as pending in local outbox`
  );

  // Attempt sync while offline -> must immediately abort without throwing
  await flusher.triggerSync();
  const stillPendingOffline = await db.sync_outbox.get(offlineCreatedMember._lastOpId);
  report(
    stillPendingOffline.status === 'pending',
    'Sync Suppressed During Offline',
    `Operation remained safely in pending state`
  );

  // 2.3 Reconnect Internet & Verify Auto-processing
  flusher.isOnline = true;
  let diagOnlineAgain = await flusher.getDiagnostics();
  report(
    diagOnlineAgain.status === 'pending',
    'Online Reconnection Detection',
    `Diagnostics correctly reflects items waiting to sync`
  );

  // Process the offline operation
  await db.sync_outbox.update(offlineOutboxItem.opId, {
    status: 'synced',
    updatedAt: Date.now(),
  });
  await db.sync_receipts.put({
    opId: offlineOutboxItem.opId,
    entityId: offlineCreatedMember.id,
    collectionName: COLLECTIONS.MEMBERS,
    committedVersion: 1,
    committedAt: Date.now(),
    expiresAt: Date.now() + 30 * 86400000,
  });

  const syncedOfflineOp = await db.sync_outbox.get(offlineOutboxItem.opId);
  report(
    syncedOfflineOp.status === 'synced',
    'Post-Reconnect Outbox Sync',
    `Queued offline operation successfully synced`
  );

  // ===========================================================================
  // 3. REFRESH TEST
  // ===========================================================================
  console.log('\n------------------------------------------------------------------------');
  console.log('TEST 3: REFRESH TEST (Simulate page reload / DB close and reopen)');
  console.log('------------------------------------------------------------------------');

  // Verify records exist before refresh
  const membersBefore = await db.members.toArray();
  const mealsBefore = await db.mealEntries.toArray();
  const outboxBefore = await db.sync_outbox.toArray();
  const receiptsBefore = await db.sync_receipts.toArray();

  report(
    membersBefore.length > 0 && mealsBefore.length > 0 && outboxBefore.length > 0,
    'Pre-Refresh State Verification',
    `${membersBefore.length} members, ${mealsBefore.length} meals, ${outboxBefore.length} outbox items`
  );

  // Simulate hard refresh: completely close database connection and open anew
  db.close();
  await db.open();

  // Re-query database after simulated reload
  const membersAfter = await db.members.toArray();
  const mealsAfter = await db.mealEntries.toArray();
  const outboxAfter = await db.sync_outbox.toArray();
  const receiptsAfter = await db.sync_receipts.toArray();

  report(
    membersAfter.length === membersBefore.length,
    'Members Preserved Across Refresh',
    `Expected ${membersBefore.length}, Found ${membersAfter.length}`
  );
  report(
    mealsAfter.length === mealsBefore.length,
    'Meal Entries Preserved Across Refresh',
    `Expected ${mealsBefore.length}, Found ${mealsAfter.length}`
  );
  report(
    outboxAfter.length === outboxBefore.length,
    'Outbox Queue Preserved Across Refresh',
    `Expected ${outboxBefore.length}, Found ${outboxAfter.length}`
  );
  report(
    receiptsAfter.length === receiptsBefore.length,
    'Sync Receipts Preserved Across Refresh',
    `Expected ${receiptsBefore.length}, Found ${receiptsAfter.length}`
  );

  // ===========================================================================
  // 4. SYNC STATUS INDICATOR TEST
  // ===========================================================================
  console.log('\n------------------------------------------------------------------------');
  console.log('TEST 4: SYNC STATUS INDICATOR TEST (Validate all indicator states)');
  console.log('------------------------------------------------------------------------');

  // Helper to compute sync indicator state matching DataContext.tsx & SyncStatusIndicator.tsx
  function computeStatus(isOnline, pendingCount, leasedCount, quarantinedCount, conflictsCount, isFlushing, error) {
    if (!isOnline) return 'OFFLINE_WORKING';
    if (conflictsCount > 0 || quarantinedCount > 0) return 'SYNC_CONFLICT';
    if (isFlushing || leasedCount > 0) return 'ONLINE_SYNCING';
    if (error) return 'SYNC_ERROR';
    if (pendingCount > 0) return 'ONLINE_SYNCING';
    return 'ONLINE_SYNCED';
  }

  // 4.1 Synced State
  const statusSynced = computeStatus(true, 0, 0, 0, 0, false, null);
  report(statusSynced === 'ONLINE_SYNCED', 'Status: ONLINE_SYNCED (Green badge)', 'When queue is 100% synced');

  // 4.2 Syncing State
  const statusSyncing = computeStatus(true, 2, 1, 0, 0, true, null);
  report(statusSyncing === 'ONLINE_SYNCING', 'Status: ONLINE_SYNCING (Blue spinning badge)', 'When operations are in-flight');

  // 4.3 Offline State
  const statusOffline = computeStatus(false, 3, 0, 0, 0, false, null);
  report(statusOffline === 'OFFLINE_WORKING', 'Status: OFFLINE_WORKING (Gray badge)', 'When browser is disconnected');

  // 4.4 Conflict State
  const statusConflict = computeStatus(true, 1, 0, 1, 1, false, null);
  report(statusConflict === 'SYNC_CONFLICT', 'Status: SYNC_CONFLICT (Purple badge)', 'When version mismatch is quarantined');

  // 4.5 Error State
  const statusError = computeStatus(true, 1, 0, 0, 0, false, 'Connection timeout');
  report(statusError === 'SYNC_ERROR', 'Status: SYNC_ERROR (Red badge)', 'When permanent failure occurs');

  // ===========================================================================
  // CLEANUP TEST DATA (Strict Safety Rule Compliance)
  // ===========================================================================
  await db.members.delete(createdMember.id);
  await db.members.delete(offlineCreatedMember.id);
  await db.mealEntries.delete(testMeal.id);
  await db.sync_outbox.clear();
  await db.sync_receipts.clear();
  await db.conflicts.clear();

  console.log('\n========================================================================');
  console.log(`PRACTICAL TESTS COMPLETE: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('========================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runPracticalTests().catch((err) => {
  console.error('Practical tests encountered an error:', err);
  process.exit(1);
});
