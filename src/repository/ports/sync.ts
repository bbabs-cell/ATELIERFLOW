import type {
  SyncOperation,
  SyncPushRequest,
  SyncPushResponse,
  SyncStatus,
  SyncWireOperation,
} from "@/domain/sync/types";

export interface SyncQueuePort {
  enqueue(op: SyncOperation): Promise<void>;
  pending(limit: number, nowMs: number): Promise<SyncOperation[]>;
  markSyncing(
    idempotencyKeys: string[],
    attemptedAt: string,
  ): Promise<SyncOperation[]>;
  requeue(idempotencyKeys: string[]): Promise<void>;
  resolve(
    idempotencyKey: string,
    status: Extract<SyncStatus, "SYNCED" | "FAILED" | "CONFLICT">,
    error: string | null,
  ): Promise<void>;
  requeueStuck(cutoffMs: number): Promise<number>;
  listAll(): Promise<SyncOperation[]>;
}

export interface LocalCachePort {
  get(entity: string, id: string): Promise<unknown | null>;
  put(entity: string, id: string, record: unknown): Promise<void>;
  remove(entity: string, id: string): Promise<void>;
  list(entity: string): Promise<unknown[]>;
}

export interface RemoteSyncPort {
  push(request: SyncPushRequest): Promise<SyncPushResponse>;
}

export function toWireOperation(op: SyncOperation): SyncWireOperation {
  return {
    idempotencyKey: op.idempotencyKey,
    tenantId: op.tenantId,
    entity: op.entity,
    entityId: op.entityId,
    operation: op.operation,
    payload: op.payload,
    createdAt: op.createdAt,
  };
}