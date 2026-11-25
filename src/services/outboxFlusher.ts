/**
 * Reliable Outbox Synchronization Engine
 * DINING MANAGEMENT SYSTEM — Phase 2 Architecture
 *
 * Guarantees:
 * 1. Automatic, ordered processing of pending Outbox operations.
 * 2. Per-entity FIFO ordering (predecessor operations must succeed before successors run).
 * 3. Atomic cloud transactions with remote version validation.
 * 4. Durable idempotency: prevents duplicate cloud writes on retries and handles legacy dual-writes via _lastOpId.
 * 5. Safe conflict isolation: version divergences are quarantined in `conflicts` and `sync_outbox` (never blindly overwritten).
 * 6. Crash recovery: expired leases are automatically reclaimed.
 * 7. Exponential backoff with maximum retry thresholds.
 */

import {
  doc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { firestore, isFirebaseConfigured } from './firebase';
import { db } from '../db';
import {
  OutboxOperation,
  OperationReceipt,
  ConflictRecord,
  OutboxStatus,
} from '../types';
import { removeUndefined } from './firestore';

export const FLUSHER_CONFIG = {
  LEASE_DURATION_MS: 45_000, // 45 seconds lease duration
  MAX_RETRIES: 5,
  BACKOFF_BASE_MS: 1_000, // 1s, 2s, 4s, 8s, 16s...
  BACKOFF_MAX_MS: 30_000, // Max 30 seconds delay between retries
  POLL_INTERVAL_MS: 15_000, // Periodic safety poll every 15s
  RECEIPT_TTL_DAYS: 30, // 30-day receipt retention
};

export interface SyncDiagnostics {
  status: 'synced' | 'syncing' | 'pending' | 'offline' | 'conflict' | 'error';
  pendingCount: number;
  leasedCount: number;
  quarantinedCount: number;
  exhaustedCount: number;
  conflictsCount: number;
  lastFlushedAt: Date | null;
  lastError: string | null;
}

export type OperationOutcome =
  | { type: 'COMMITTED'; version: number }
  | { type: 'ALREADY_APPLIED'; version: number }
  | { type: 'CONFLICT'; remoteData: any; remoteVersion: number }
  | { type: 'NETWORK_ERROR'; message: string };

export class OutboxFlusher {
  private isFlushing = false;
  private pollTimer: any = null;
  private lastFlushedAt: Date | null = null;
  private lastError: string | null = null;
  private isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private listeners: Set<(diag: SyncDiagnostics) => void> = new Set();
  private onlineHandler: (() => void) | null = null;
  private offlineHandler: (() => void) | null = null;

  constructor() {
    this.setupNetworkListeners();
  }

  // ---------------------------------------------------------------------------
  // Lifecycle & Diagnostics
  // ---------------------------------------------------------------------------

  private setupNetworkListeners() {
    if (typeof window === 'undefined') return;

    this.onlineHandler = () => {
      this.isOnline = true;
      this.notifyListeners();
      this.triggerSync();
    };

    this.offlineHandler = () => {
      this.isOnline = false;
      this.notifyListeners();
    };

    window.addEventListener('online', this.onlineHandler);
    window.addEventListener('offline', this.offlineHandler);
  }

  public startPeriodicSync() {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => {
      this.triggerSync();
    }, FLUSHER_CONFIG.POLL_INTERVAL_MS);
    // Initial sync trigger
    this.triggerSync();
  }

  public stopPeriodicSync() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  public destroy() {
    this.stopPeriodicSync();
    if (typeof window !== 'undefined') {
      if (this.onlineHandler) window.removeEventListener('online', this.onlineHandler);
      if (this.offlineHandler) window.removeEventListener('offline', this.offlineHandler);
    }
    this.listeners.clear();
  }

  public subscribe(cb: (diag: SyncDiagnostics) => void): () => void {
    this.listeners.add(cb);
    this.getDiagnostics().then(cb);
    return () => this.listeners.delete(cb);
  }

  private async notifyListeners() {
    if (this.listeners.size === 0) return;
    const diag = await this.getDiagnostics();
    for (const listener of this.listeners) {
      try {
        listener(diag);
      } catch (err) {
        console.warn('[OutboxFlusher] Listener notification error:', err);
      }
    }
  }

  public async getDiagnostics(): Promise<SyncDiagnostics> {
    try {
      const counts = await db.sync_outbox.toArray();
      let pendingCount = 0;
      let leasedCount = 0;
      let quarantinedCount = 0;
      let exhaustedCount = 0;

      for (const op of counts) {
        if (op.status === 'pending') pendingCount++;
        else if (op.status === 'leased') leasedCount++;
        else if (op.status === 'quarantined') quarantinedCount++;
        else if (op.status === 'failed_exhausted') exhaustedCount++;
      }

      const conflictsCount = await db.conflicts.where('status').equals('UNRESOLVED').count();

      let status: SyncDiagnostics['status'] = 'synced';
      if (!this.isOnline) {
        status = 'offline';
      } else if (conflictsCount > 0 || quarantinedCount > 0) {
        status = 'conflict';
      } else if (this.isFlushing || leasedCount > 0) {
        status = 'syncing';
      } else if (this.lastError && pendingCount > 0) {
        status = 'error';
      } else if (pendingCount > 0) {
        status = 'pending';
      }

      return {
        status,
        pendingCount,
        leasedCount,
        quarantinedCount,
        exhaustedCount,
        conflictsCount,
        lastFlushedAt: this.lastFlushedAt,
        lastError: this.lastError,
      };
    } catch {
      return {
        status: 'error',
        pendingCount: 0,
        leasedCount: 0,
        quarantinedCount: 0,
        exhaustedCount: 0,
        conflictsCount: 0,
        lastFlushedAt: this.lastFlushedAt,
        lastError: this.lastError,
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Lease Recovery
  // ---------------------------------------------------------------------------

  /**
   * Reclaims operations whose leases expired due to page refresh, crash, or unexpected close.
   */
  public async recoverExpiredLeases(): Promise<number> {
    const now = Date.now();
    const expiredOps = await db.sync_outbox
      .where('status')
      .equals('leased')
      .filter((op) => !op.leaseExpiresAt || op.leaseExpiresAt < now)
      .toArray();

    if (expiredOps.length === 0) return 0;

    for (const op of expiredOps) {
      await db.sync_outbox.update(op.opId, {
        status: 'pending',
        leaseToken: null,
        leaseExpiresAt: null,
        updatedAt: now,
      });
    }

    return expiredOps.length;
  }

  // ---------------------------------------------------------------------------
  // Core Synchronization Execution
  // ---------------------------------------------------------------------------

  /**
   * Triggers an immediate asynchronous outbox flush.
   */
  public async triggerSync(): Promise<void> {
    if (this.isFlushing) return;
    if (!this.isOnline) return;
    if (!isFirebaseConfigured || !firestore) return;

    this.isFlushing = true;
    this.notifyListeners();

    try {
      await this.flushQueue();
      this.lastError = null;
    } catch (err: any) {
      console.warn('[OutboxFlusher] Flush queue encountered an error:', err);
      this.lastError = err.message || 'Unknown sync error';
    } finally {
      this.isFlushing = false;
      this.lastFlushedAt = new Date();
      this.notifyListeners();
    }
  }

  /**
   * Flushes pending operations respecting per-entity ordering, backoff, and leases.
   */
  private async flushQueue(): Promise<void> {
    // 1. Recover expired leases from prior interrupted runs
    await this.recoverExpiredLeases();

    let hasMoreWork = true;
    while (hasMoreWork) {
      const now = Date.now();

      // 2. Query all pending operations ordered by creation time
      const allPending = await db.sync_outbox
        .where('status')
        .equals('pending')
        .sortBy('createdAt');

      if (allPending.length === 0) {
        hasMoreWork = false;
        break;
      }

      // 3. Filter operations eligible to execute (satisfying exponential backoff)
      const eligibleOps: OutboxOperation[] = [];
      const entityClaimed = new Set<string>();

      for (const op of allPending) {
        const entityKey = `${op.collectionName}:${op.entityId}`;

        // Per-entity FIFO ordering: only process the head operation for any entity
        if (entityClaimed.has(entityKey)) continue;
        entityClaimed.add(entityKey);

        // Check exponential backoff
        const backoffDelay = Math.min(
          FLUSHER_CONFIG.BACKOFF_BASE_MS * Math.pow(2, op.retryCount),
          FLUSHER_CONFIG.BACKOFF_MAX_MS
        );
        const lastAttempt = op.updatedAt || op.createdAt;
        if (op.retryCount > 0 && now - lastAttempt < backoffDelay) {
          // Still in backoff window, skip for now
          continue;
        }

        eligibleOps.push(op);
      }

      if (eligibleOps.length === 0) {
        hasMoreWork = false;
        break;
      }

      // 4. Process eligible entity heads in parallel
      const leaseToken = `lease_${now}_${Math.random().toString(36).slice(2, 7)}`;
      let committedInThisBatch = 0;

      for (const op of eligibleOps) {
        // Lease operation in IndexedDB
        await db.sync_outbox.update(op.opId, {
          status: 'leased',
          leaseToken,
          leaseExpiresAt: now + FLUSHER_CONFIG.LEASE_DURATION_MS,
          updatedAt: now,
        });

        const outcome = await this.executeCloudTransaction(op);

        if (outcome.type === 'COMMITTED' || outcome.type === 'ALREADY_APPLIED') {
          // Persist durable idempotency receipt
          const receipt: OperationReceipt = {
            opId: op.opId,
            entityId: op.entityId,
            collectionName: op.collectionName,
            committedVersion: outcome.version,
            committedAt: now,
            expiresAt: now + FLUSHER_CONFIG.RECEIPT_TTL_DAYS * 86_400_000,
          };
          await db.sync_receipts.put(receipt);

          // Mark Outbox record as synced
          await db.sync_outbox.update(op.opId, {
            status: 'synced',
            leaseToken: null,
            leaseExpiresAt: null,
            updatedAt: now,
            error: null,
          });

          committedInThisBatch++;
        } else if (outcome.type === 'CONFLICT') {
          // Version mismatch: quarantine operation and create conflict record
          await db.sync_outbox.update(op.opId, {
            status: 'quarantined',
            quarantineReason: 'VERSION_CONFLICT',
            quarantinedAt: now,
            leaseToken: null,
            leaseExpiresAt: null,
            updatedAt: now,
          });

          const conflictRecord: ConflictRecord = {
            id: `conflict_${op.opId}`,
            opId: op.opId,
            collectionName: op.collectionName,
            entityId: op.entityId,
            localPayload: op.payload,
            cloudPayload: outcome.remoteData,
            localVersion: op.localVersion,
            cloudVersion: outcome.remoteVersion,
            detectedAt: now,
            status: 'UNRESOLVED',
            cloudSyncStatus: 'PENDING_UPLOAD',
          };
          await db.conflicts.put(conflictRecord);
        } else if (outcome.type === 'NETWORK_ERROR') {
          const nextRetry = op.retryCount + 1;
          if (nextRetry >= FLUSHER_CONFIG.MAX_RETRIES) {
            // Retries exhausted: mark as failed_exhausted for admin attention
            await db.sync_outbox.update(op.opId, {
              status: 'failed_exhausted',
              retryCount: nextRetry,
              leaseToken: null,
              leaseExpiresAt: null,
              updatedAt: now,
              error: outcome.message,
            });
          } else {
            // Return to pending status with backoff count incremented
            await db.sync_outbox.update(op.opId, {
              status: 'pending',
              retryCount: nextRetry,
              leaseToken: null,
              leaseExpiresAt: null,
              updatedAt: now,
              error: outcome.message,
            });
          }
        }
      }

      // If nothing succeeded or made progress, break loop to prevent spinning
      if (committedInThisBatch === 0) {
        hasMoreWork = false;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Firestore Transaction & Idempotency
  // ---------------------------------------------------------------------------

  /**
   * Executes a single Outbox operation within a Firestore Transaction.
   * Checks idempotency, validates server version succession, and commits.
   */
  private async executeCloudTransaction(op: OutboxOperation): Promise<OperationOutcome> {
    if (!firestore) {
      return { type: 'NETWORK_ERROR', message: 'Firestore instance unavailable' };
    }

    try {
      return await runTransaction(firestore, async (transaction) => {
        const docRef = doc(firestore, op.collectionName, op.entityId);
        const remoteSnap = await transaction.get(docRef);

        if (remoteSnap.exists()) {
          const remoteData = remoteSnap.data();
          const remoteVersion = typeof remoteData._version === 'number' ? remoteData._version : 0;
          const remoteLastOpId = remoteData._lastOpId;

          // 1. Idempotency Check: Has this exact operation already been committed?
          // (Handles retries after client timeout or legacy dual-writes)
          if (remoteLastOpId === op.opId) {
            return {
              type: 'ALREADY_APPLIED',
              version: remoteVersion,
            };
          }

          // 2. Conflict Check: Has remote been modified past our base version by another client?
          if (remoteVersion > op.prevEntityVersion) {
            return {
              type: 'CONFLICT',
              remoteData,
              remoteVersion,
            };
          }
        }

        // 3. Prepare payload for commit
        const cleanedPayload = removeUndefined(op.payload);
        const commitPayload: Record<string, any> = {
          ...cleanedPayload,
          id: op.entityId,
          _version: op.localVersion,
          _lastOpId: op.opId,
          _lastModifiedLocally: op.payload._lastModifiedLocally || Date.now(),
          _serverTimestamp: serverTimestamp(),
        };

        if (op.operationType === 'SOFT_DELETE') {
          commitPayload._isDeleted = true;
          commitPayload._deletedAt = op.payload._deletedAt || Date.now();
          commitPayload._deletedVersion = op.localVersion;
        }

        transaction.set(docRef, commitPayload, { merge: true });

        return {
          type: 'COMMITTED',
          version: op.localVersion,
        };
      });
    } catch (err: any) {
      return {
        type: 'NETWORK_ERROR',
        message: err.message || 'Firestore transaction failed',
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Admin Conflict Resolution & Manual Retry
  // ---------------------------------------------------------------------------

  /**
   * Retries an operation that was previously quarantined or marked failed_exhausted.
   */
  public async retryOperation(opId: string): Promise<boolean> {
    const op = await db.sync_outbox.get(opId);
    if (!op) return false;

    await db.sync_outbox.update(opId, {
      status: 'pending',
      retryCount: 0,
      leaseToken: null,
      leaseExpiresAt: null,
      error: null,
      updatedAt: Date.now(),
    });

    this.triggerSync();
    return true;
  }
}

// Global Singleton Instance
export const outboxFlusher = new OutboxFlusher();
