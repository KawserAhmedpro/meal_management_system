/**
 * Synchronization, Outbox, and Conflict Resolution Types
 * DINING MANAGEMENT SYSTEM — Phase 1 Local-First Architecture
 */

export type OutboxStatus =
  | 'pending'
  | 'leased'
  | 'synced'
  | 'quarantined'
  | 'failed_exhausted';

export type OutboxOperationType = 'UPSERT' | 'SOFT_DELETE';

export interface OutboxOperation<T = any> {
  opId: string;
  collectionName: string;
  entityId: string;
  operationType: OutboxOperationType;
  payload: T;
  prevEntityVersion: number;
  localVersion: number;
  clientId: string;
  status: OutboxStatus;
  retryCount: number;
  createdAt: number;
  updatedAt: number;
  leaseToken?: string | null;
  leaseExpiresAt?: number | null;
  error?: string | null;
  quarantineReason?: string | null;
  quarantinedAt?: number | null;
}

export interface OperationReceipt {
  opId: string;
  entityId: string;
  collectionName: string;
  committedVersion: number;
  committedAt: number;
  expiresAt: number;
}

export type ConflictStatus =
  | 'UNRESOLVED'
  | 'RESOLVED_LOCAL'
  | 'RESOLVED_CLOUD'
  | 'RESOLVED_MERGE';

export interface ConflictRecord<T = any> {
  id: string; // conflict_${opId}
  opId: string;
  collectionName: string;
  entityId: string;
  localPayload: T;
  cloudPayload: any;
  localVersion: number;
  cloudVersion: number;
  detectedAt: number;
  status: ConflictStatus;
  resolution?: any | null;
  cloudSyncStatus: 'PENDING_UPLOAD' | 'SYNCED';
}

export interface ManagerCorrection {
  id: string; // e.g. "CORR-xxx"
  targetManagerId: string;
  correctionType: 'TENURE_ADJUSTMENT' | 'REVOKE_RESIGNATION' | 'NAME_CORRECTION';
  adjustedStartDate?: string | null;
  adjustedEndDate?: string | null;
  adjustedStatus?: 'Active' | 'Resigned';
  reason: string;
  authorizedBy: string;
  createdAt: number;
}

export interface SyncMetadata {
  _version?: number;
  _lastOpId?: string;
  _lastModifiedLocally?: number;
  _serverTimestamp?: any;
  _lastSyncedAt?: number;
  _isDeleted?: boolean;
  _deletedAt?: number;
  _deletedVersion?: number;
}

export interface SequenceCounter {
  id: string; // e.g. "member_id"
  lastValue: number;
  updatedAt: number;
}
