/**
 * Safe Inbound Snapshot Synchronization Service
 * DINING MANAGEMENT SYSTEM — Phase 2 Architecture
 *
 * Prevents incoming Firestore onSnapshot mirrors from destructively overwriting
 * local records that have pending or in-flight Outbox operations.
 */

import { Table } from 'dexie';
import { db } from '../db';
import { OutboxOperation, ConflictRecord } from '../types';

export interface InboundSyncResult {
  updatedCount: number;
  protectedCount: number;
  conflictCount: number;
}

/**
 * Atomically mirrors cloud snapshot documents into the local Dexie table
 * while guarding all entities with pending Outbox operations.
 */
export async function safeInboundSync<T extends { id?: string; [key: string]: any }>(
  table: Table<T, any>,
  collectionName: string,
  cloudList: T[],
  getId: (item: T) => string
): Promise<InboundSyncResult> {
  if (cloudList.length === 0) {
    return { updatedCount: 0, protectedCount: 0, conflictCount: 0 };
  }

  return await db.transaction('rw', [table, db.sync_outbox, db.conflicts], async () => {
    let updatedCount = 0;
    let protectedCount = 0;
    let conflictCount = 0;

    // 1. Fetch active outbox operations for this collection
    const activeOps = await db.sync_outbox
      .where('collectionName')
      .equals(collectionName)
      .and((op) => op.status === 'pending' || op.status === 'leased')
      .toArray();

    const activeOpMap = new Map<string, OutboxOperation>();
    for (const op of activeOps) {
      activeOpMap.set(op.entityId, op);
    }

    // 2. Process each remote document
    for (const cloudDoc of cloudList) {
      const entityId = getId(cloudDoc);
      const activeOp = activeOpMap.get(entityId);
      const cloudVersion = typeof cloudDoc._version === 'number' ? cloudDoc._version : 0;

      if (activeOp) {
        // Locally pending entity!
        if (cloudDoc._lastOpId === activeOp.opId) {
          // This snapshot is an echo of our own committed mutation: safe to mirror
          await table.put(cloudDoc);
          updatedCount++;
        } else {
          // Foreign cloud change while local changes are pending: DO NOT OVERWRITE
          protectedCount++;
          if (cloudVersion > activeOp.prevEntityVersion) {
            // Divergent conflict detected
            conflictCount++;
            const conflictId = `conflict_${activeOp.opId}`;
            const existingConflict = await db.conflicts.get(conflictId);
            if (!existingConflict) {
              const conflictRecord: ConflictRecord = {
                id: conflictId,
                opId: activeOp.opId,
                collectionName,
                entityId,
                localPayload: activeOp.payload,
                cloudPayload: cloudDoc,
                localVersion: activeOp.localVersion,
                cloudVersion,
                detectedAt: Date.now(),
                status: 'UNRESOLVED',
                cloudSyncStatus: 'PENDING_UPLOAD',
              };
              await db.conflicts.put(conflictRecord);
            }
          }
        }
      } else {
        // No local pending changes: safe to mirror if cloud is >= local version
        const localDoc = await table.get(entityId);
        const localVersion = localDoc && typeof localDoc._version === 'number' ? localDoc._version : 0;

        if (!localDoc || cloudVersion >= localVersion) {
          await table.put(cloudDoc);
          updatedCount++;
        } else {
          protectedCount++;
        }
      }
    }

    return { updatedCount, protectedCount, conflictCount };
  });
}
