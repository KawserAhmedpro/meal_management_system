/**
 * Centralized Data Mutation Gateway
 * DINING MANAGEMENT SYSTEM — Phase 1.1 Local-First Architecture
 *
 * Guarantees:
 * 1. Single controlled entry point for all create, update, and delete mutations.
 * 2. Per-Entity Mutex Serialization: Prevents concurrent mutations on the same entity
 *    from reading the same base version or racing in-memory.
 * 3. Atomic local write: Domain table and sync_outbox are updated together
 *    in a single Dexie transaction (all-or-nothing).
 * 4. Stable, globally unique operation IDs per mutation.
 * 5. Per-entity local monotonic version sequencing without divergence.
 * 6. Ordinary hard delete is disabled; soft deletes preserve deletion watermarks.
 * 7. Safe ID generation: Deleted member IDs cannot be accidentally reused.
 */

import { db } from '../db';
import {
  Member,
  MealEntry,
  Expense,
  Deposit,
  Category,
  SystemSettings,
  ManagerPeriod,
  DailyMealClosure,
  OutboxOperation,
  OutboxOperationType,
  OutboxStatus,
} from '../types';
import { COLLECTIONS } from './firestore';

// -----------------------------------------------------------------------------
// Client Instance Identification
// -----------------------------------------------------------------------------

let cachedClientId: string | null = null;

export function getClientInstanceId(): string {
  if (cachedClientId) return cachedClientId;

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      let storedId = window.localStorage.getItem('mms_sync_client_id');
      if (!storedId) {
        storedId = typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `client_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        window.localStorage.setItem('mms_sync_client_id', storedId);
      }
      cachedClientId = storedId;
      return cachedClientId;
    } catch {
      // Fallback if localStorage is restricted
    }
  }

  cachedClientId = `client_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  return cachedClientId;
}

/**
 * Generates a globally unique, immutable operation ID.
 * Format: op_{collection}_{entityId}_{shortClientId}_{timestamp}_{random}
 */
export function generateOperationId(collectionName: string, entityId: string): string {
  const clientId = getClientInstanceId().slice(0, 8);
  const timestamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 7);
  // Sanitize entity ID for safe operation key
  const safeEntityId = entityId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `op_${collectionName}_${safeEntityId}_${clientId}_${timestamp}_${rand}`;
}

// -----------------------------------------------------------------------------
// Per-Entity In-Memory Mutex Lock Queue
// -----------------------------------------------------------------------------

/**
 * Map of in-flight operation queues keyed by `${collectionName}:${entityId}`.
 * Guarantees that concurrent mutations for the SAME entity are processed strictly
 * in order, while mutations on DIFFERENT entities run in parallel without contention.
 */
const entityLocks = new Map<string, Promise<any>>();

export async function withEntityLock<R>(
  collectionName: string,
  entityId: string,
  fn: () => Promise<R>
): Promise<R> {
  const key = `${collectionName}:${entityId}`;
  const currentTail = entityLocks.get(key) || Promise.resolve();

  const nextTail = currentTail
    .catch(() => {}) // Catch any error from previous task so chain does not stall
    .then(() => fn());

  entityLocks.set(key, nextTail);

  try {
    return await nextTail;
  } finally {
    // Memory cleanup: If this task is still the tail of the queue, remove the key
    if (entityLocks.get(key) === nextTail) {
      entityLocks.delete(key);
    }
  }
}

/**
 * Returns the current active lock count for diagnostic purposes.
 */
export function getActiveEntityLockCount(): number {
  return entityLocks.size;
}

/**
 * Hierarchical Multi-Entity Mutex
 * Locks multiple entities in strictly sorted ID order to guarantee zero deadlocks
 * between concurrent bulk operations, or between bulk and single-entity operations.
 */
export async function withEntitiesLock<R>(
  collectionName: string,
  entityIds: string[],
  fn: () => Promise<R>
): Promise<R> {
  const sortedUniqueIds = Array.from(new Set(entityIds)).sort();
  if (sortedUniqueIds.length === 0) return fn();

  const acquire = (index: number): Promise<R> => {
    if (index >= sortedUniqueIds.length) {
      return fn();
    }
    return withEntityLock(collectionName, sortedUniqueIds[index], () => acquire(index + 1));
  };

  return acquire(0);
}

// -----------------------------------------------------------------------------
// Safe ID Generation & Deletion Watermark Protection
// -----------------------------------------------------------------------------

/**
 * Safely inspects the durable sequence counter to project the next Member ID.
 * Note: Actual allocation must be performed inside DataMutationGateway.createMember()
 * to guarantee atomicity and avoid allocation races.
 */
export async function generateNextMemberId(): Promise<string> {
  let counterRec = await db.sequence_counters.get('member_id');
  let counter = counterRec?.lastValue;

  if (counter === undefined || counter === null) {
    const allMembers = await db.members.toArray();
    let maxNum = 0;
    for (const m of allMembers) {
      const match = m.id && m.id.match(/^MEM-(\d+)$/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    }
    counter = maxNum;
  }
  const nextNum = counter + 1;
  return `MEM-${String(nextNum).padStart(3, '0')}`;
}

// -----------------------------------------------------------------------------
// Generic Mutation Result
// -----------------------------------------------------------------------------

export interface MutationResult<T> {
  entity: T;
  operation: OutboxOperation<T>;
}

// -----------------------------------------------------------------------------
// Core Atomic Mutation Execution (Guarded by Per-Entity Mutex)
// -----------------------------------------------------------------------------

/**
 * Atomically mutates a domain entity and creates its corresponding Outbox operation
 * within a single Dexie transaction, protected by a per-entity mutex.
 */
export async function executeAtomicMutation<T extends { id: string; [key: string]: any }>(
  table: any,
  collectionName: string,
  entityId: string,
  payload: Partial<T>,
  operationType: OutboxOperationType = 'UPSERT'
): Promise<MutationResult<T>> {
  // Wrap execution inside the per-entity mutex lock
  return await withEntityLock(collectionName, entityId, async () => {
    const now = Date.now();
    const clientId = getClientInstanceId();
    const opId = generateOperationId(collectionName, entityId);

    return await db.transaction('rw', [table, db.sync_outbox], async () => {
      // 1. Read existing record
      const existing = await table.get(entityId);
      const prevVersion: number = existing?._version || 0;

      // 2. Inspect pending un-flushed Outbox operations for this entity to prevent version divergence
      const pendingOps = await db.sync_outbox
        .where('[collectionName+entityId+status]')
        .equals([collectionName, entityId, 'pending'])
        .sortBy('localVersion');

      // Local sequence version monotonically increments
      const outboxMaxVersion = pendingOps.length > 0
        ? pendingOps[pendingOps.length - 1].localVersion
        : 0;
      const baseVersion = Math.max(prevVersion, outboxMaxVersion);
      const nextVersion = baseVersion + 1;

      // 3. Assemble mutated entity state
      const isDelete = operationType === 'SOFT_DELETE';
      const mutatedEntity: T = {
        ...(existing || {}),
        ...payload,
        id: entityId,
        _version: nextVersion,
        _lastOpId: opId,
        _lastModifiedLocally: now,
        _isDeleted: isDelete,
        ...(isDelete
          ? { _deletedAt: now, _deletedVersion: nextVersion }
          : { _deletedAt: null, _deletedVersion: null }
        ),
      } as T;

      // 4. Save entity into domain table
      await table.put(mutatedEntity);

      // 5. Create durable Outbox record
      const outboxItem: OutboxOperation<T> = {
        opId,
        collectionName,
        entityId,
        operationType,
        payload: mutatedEntity,
        prevEntityVersion: baseVersion, // Correct predecessor in local sequence
        localVersion: nextVersion,
        clientId,
        status: 'pending',
        retryCount: 0,
        createdAt: now,
        updatedAt: now,
        leaseToken: null,
        leaseExpiresAt: null,
        error: null,
      };

      await db.sync_outbox.put(outboxItem);

      return {
        entity: mutatedEntity,
        operation: outboxItem,
      };
    });
  });
}

// -----------------------------------------------------------------------------
// Domain-Specific Gateways
// -----------------------------------------------------------------------------

export class DataMutationGateway {
  // Members
  /**
   * Atomic, Insert-Only Member Creation
   * 1. Acquires global allocation mutex in-memory.
   * 2. Reads & advances durable sequence counter atomically inside Dexie transaction.
   * 3. Uses insert-only table.add() - throws on collision; never silently overwrites.
   * 4. Creates corresponding Outbox record in the same transaction.
   */
  static async createMember(memberData: Omit<Member, 'id'> | Member): Promise<MutationResult<Member>> {
    const now = Date.now();
    const clientId = getClientInstanceId();

    return await withEntityLock(COLLECTIONS.MEMBERS, '__member_allocation_lock__', async () => {
      return await db.transaction('rw', [db.members, db.sequence_counters, db.sync_outbox], async () => {
        // 1. Fetch durable sequence counter
        let counterRec = await db.sequence_counters.get('member_id');
        let counter = counterRec?.lastValue;

        // If counter is missing or uninitialized, reconcile against existing members
        if (counter === undefined || counter === null) {
          const allMembers = await db.members.toArray();
          let maxNum = 0;
          for (const m of allMembers) {
            const match = m.id && m.id.match(/^MEM-(\d+)$/i);
            if (match) {
              const num = parseInt(match[1], 10);
              if (!isNaN(num) && num > maxNum) maxNum = num;
            }
          }
          counter = maxNum;
        }

        // 2. Allocate next sequential ID
        let assignedId: string;
        let nextVal = counter;

        if ('id' in memberData && memberData.id && typeof memberData.id === 'string' && memberData.id.trim() !== '') {
          assignedId = memberData.id.trim();
          const match = assignedId.match(/^MEM-(\d+)$/i);
          if (match) {
            const num = parseInt(match[1], 10);
            if (!isNaN(num) && num > nextVal) {
              nextVal = num;
            }
          }
        } else {
          nextVal = counter + 1;
          assignedId = `MEM-${String(nextVal).padStart(3, '0')}`;

          // Reconcile: advance counter if an existing legacy member already occupies this ID
          while (await db.members.get(assignedId)) {
            nextVal++;
            assignedId = `MEM-${String(nextVal).padStart(3, '0')}`;
          }
        }

        // 3. Insert-Only Check: Verify assignedId does not exist
        const existing = await db.members.get(assignedId);
        if (existing) {
          throw new Error(`MEMBER_ID_COLLISION: Member with ID ${assignedId} already exists. Insert aborted to prevent overwrite.`);
        }

        // 4. Update durable sequence counter in the SAME transaction
        await db.sequence_counters.put({
          id: 'member_id',
          lastValue: nextVal,
          updatedAt: now,
        });

        // 5. Assemble mutated entity state
        const opId = generateOperationId(COLLECTIONS.MEMBERS, assignedId);
        const newMember: Member = {
          ...memberData,
          id: assignedId,
          _version: 1,
          _lastOpId: opId,
          _lastModifiedLocally: now,
          _isDeleted: false,
          _deletedAt: null,
          _deletedVersion: null,
        } as Member;

        // 6. INSERT-ONLY: Use table.add() which throws ConstraintError if primary key exists
        await db.members.add(newMember);

        // 7. Write durable Outbox operation
        const outboxItem: OutboxOperation<Member> = {
          opId,
          collectionName: COLLECTIONS.MEMBERS,
          entityId: assignedId,
          operationType: 'UPSERT',
          payload: newMember,
          prevEntityVersion: 0,
          localVersion: 1,
          clientId,
          status: 'pending',
          retryCount: 0,
          createdAt: now,
          updatedAt: now,
          leaseToken: null,
          leaseExpiresAt: null,
          error: null,
        };

        await db.sync_outbox.put(outboxItem);

        return {
          entity: newMember,
          operation: outboxItem,
        };
      });
    });
  }

  static async updateMember(member: Member): Promise<MutationResult<Member>> {
    if (!member.id) {
      throw new Error('UPDATE_ERROR: Member ID is required to update an existing member.');
    }
    return executeAtomicMutation<Member>(
      db.members,
      COLLECTIONS.MEMBERS,
      member.id,
      member,
      'UPSERT'
    );
  }

  static async saveMember(member: Member): Promise<MutationResult<Member>> {
    if (!member.id) {
      return this.createMember(member);
    }
    return executeAtomicMutation<Member>(
      db.members,
      COLLECTIONS.MEMBERS,
      member.id,
      member,
      'UPSERT'
    );
  }

  static async deleteMember(id: string): Promise<MutationResult<Member>> {
    return executeAtomicMutation<Member>(
      db.members,
      COLLECTIONS.MEMBERS,
      id,
      { status: 'Inactive' } as Partial<Member>,
      'SOFT_DELETE'
    );
  }

  // Meal Entries
  static async saveMealEntry(entry: MealEntry): Promise<MutationResult<MealEntry>> {
    return executeAtomicMutation<MealEntry>(
      db.mealEntries,
      COLLECTIONS.MEAL_ENTRIES,
      entry.id,
      entry,
      'UPSERT'
    );
  }

  static async saveMealEntriesBulk(entries: MealEntry[]): Promise<MealEntry[]> {
    if (entries.length === 0) return [];
    const now = Date.now();
    const clientId = getClientInstanceId();

    // Sort entries deterministically by ID to prevent deadlocks across concurrent bulk writes
    const sortedEntries = [...entries].sort((a, b) => a.id.localeCompare(b.id));
    const entityIds = sortedEntries.map((e) => e.id);

    // Acquire hierarchical entity locks for all affected entities to ensure compatible concurrency with saveMealEntry
    return await withEntitiesLock(COLLECTIONS.MEAL_ENTRIES, entityIds, async () => {
      return await db.transaction('rw', [db.mealEntries, db.sync_outbox], async () => {
        const results: MealEntry[] = [];

        for (const entry of sortedEntries) {
          const existing = await db.mealEntries.get(entry.id);
          const prevVersion: number = existing?._version || 0;

          // Inspect pending un-flushed Outbox operations for this meal entry to prevent version divergence
          const pendingOps = await db.sync_outbox
            .where('[collectionName+entityId+status]')
            .equals([COLLECTIONS.MEAL_ENTRIES, entry.id, 'pending'])
            .sortBy('localVersion');

          const outboxMaxVersion = pendingOps.length > 0
            ? pendingOps[pendingOps.length - 1].localVersion
            : 0;
          const baseVersion = Math.max(prevVersion, outboxMaxVersion);
          const nextVersion = baseVersion + 1;
          const opId = generateOperationId(COLLECTIONS.MEAL_ENTRIES, entry.id);

          const mutated: MealEntry = {
            ...(existing || {}),
            ...entry,
            _version: nextVersion,
            _lastOpId: opId,
            _lastModifiedLocally: now,
            _isDeleted: false,
            _deletedAt: null,
            _deletedVersion: null,
          };

          await db.mealEntries.put(mutated);

          const outboxItem: OutboxOperation<MealEntry> = {
            opId,
            collectionName: COLLECTIONS.MEAL_ENTRIES,
            entityId: entry.id,
            operationType: 'UPSERT',
            payload: mutated,
            prevEntityVersion: baseVersion, // Correct predecessor in local sequence
            localVersion: nextVersion,
            clientId,
            status: 'pending',
            retryCount: 0,
            createdAt: now,
            updatedAt: now,
            leaseToken: null,
            leaseExpiresAt: null,
            error: null,
          };

          await db.sync_outbox.put(outboxItem);
          results.push(mutated);
        }

        return results;
      });
    });
  }

  // Expenses
  static async saveExpense(expense: Expense): Promise<MutationResult<Expense>> {
    return executeAtomicMutation<Expense>(
      db.expenses,
      COLLECTIONS.EXPENSES,
      expense.id,
      expense,
      'UPSERT'
    );
  }

  static async deleteExpense(id: string): Promise<MutationResult<Expense>> {
    return executeAtomicMutation<Expense>(
      db.expenses,
      COLLECTIONS.EXPENSES,
      id,
      {} as Partial<Expense>,
      'SOFT_DELETE'
    );
  }

  // Deposits
  static async saveDeposit(deposit: Deposit): Promise<MutationResult<Deposit>> {
    return executeAtomicMutation<Deposit>(
      db.deposits,
      COLLECTIONS.DEPOSITS,
      deposit.id,
      deposit,
      'UPSERT'
    );
  }

  static async deleteDeposit(id: string): Promise<MutationResult<Deposit>> {
    return executeAtomicMutation<Deposit>(
      db.deposits,
      COLLECTIONS.DEPOSITS,
      id,
      {} as Partial<Deposit>,
      'SOFT_DELETE'
    );
  }

  // Categories
  static async saveCategory(category: Category): Promise<MutationResult<Category>> {
    return executeAtomicMutation<Category>(
      db.categories,
      COLLECTIONS.CATEGORIES,
      category.id,
      category,
      'UPSERT'
    );
  }

  // Managers
  static async saveManager(manager: ManagerPeriod): Promise<MutationResult<ManagerPeriod>> {
    return executeAtomicMutation<ManagerPeriod>(
      db.managers,
      COLLECTIONS.MANAGERS,
      manager.id,
      manager,
      'UPSERT'
    );
  }

  static async deleteManager(id: string): Promise<MutationResult<ManagerPeriod>> {
    return executeAtomicMutation<ManagerPeriod>(
      db.managers,
      COLLECTIONS.MANAGERS,
      id,
      { status: 'Resigned' } as Partial<ManagerPeriod>,
      'SOFT_DELETE'
    );
  }

  // Daily Closures
  static async saveDailyClosure(closure: DailyMealClosure): Promise<MutationResult<DailyMealClosure>> {
    return executeAtomicMutation<DailyMealClosure>(
      db.dailyClosures,
      COLLECTIONS.DAILY_CLOSURES,
      closure.date,
      closure,
      'UPSERT'
    );
  }

  static async deleteDailyClosure(date: string): Promise<MutationResult<DailyMealClosure>> {
    return executeAtomicMutation<DailyMealClosure>(
      db.dailyClosures,
      COLLECTIONS.DAILY_CLOSURES,
      date,
      {} as Partial<DailyMealClosure>,
      'SOFT_DELETE'
    );
  }

  // Settings
  static async updateSettings(newSettings: Partial<SystemSettings>): Promise<MutationResult<SystemSettings>> {
    const existing = (await db.settings.get('app_settings')) || ({} as SystemSettings);
    const merged: SystemSettings = {
      ...existing,
      ...newSettings,
      id: 'app_settings',
    };

    return executeAtomicMutation<SystemSettings>(
      db.settings,
      COLLECTIONS.SETTINGS,
      'app_settings',
      merged,
      'UPSERT'
    );
  }

  // ---------------------------------------------------------------------------
  // Outbox Status & Diagnostics
  // ---------------------------------------------------------------------------

  static async getPendingOutboxCount(): Promise<number> {
    return await db.sync_outbox.where('status').equals('pending').count();
  }

  static async getOutboxCountByStatus(): Promise<Record<OutboxStatus, number>> {
    const all = await db.sync_outbox.toArray();
    const counts: Record<OutboxStatus, number> = {
      pending: 0,
      leased: 0,
      synced: 0,
      quarantined: 0,
      failed_exhausted: 0,
    };
    for (const op of all) {
      if (counts[op.status] !== undefined) {
        counts[op.status]++;
      }
    }
    return counts;
  }

  static async getQuarantinedOperations(): Promise<OutboxOperation[]> {
    return await db.sync_outbox.where('status').equals('quarantined').toArray();
  }
}
