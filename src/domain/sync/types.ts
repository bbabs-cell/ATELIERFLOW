export const SYNC_STATUSES = [
  "PENDING",
  "SYNCING",
  "SYNCED",
  "FAILED",
  "CONFLICT",
] as const;

export type SyncStatus = (typeof SYNC_STATUSES)[number];

export const SYNC_OPERATIONS = ["INSERT", "UPDATE", "DELETE"] as const;

export type SyncOperationKind = (typeof SYNC_OPERATIONS)[number];

export interface SyncOperation {
  idempotencyKey: string;
  tenantId: string;
  profileId: string | null;
  entity: string;
  entityId: string;
  operation: SyncOperationKind;
  payload: unknown;
  createdAt: string;
  status: SyncStatus;
  retryCount: number;
  lastAttemptAt: string | null;
  lastError: string | null;
}

export interface SyncWireOperation {
  idempotencyKey: string;
  tenantId: string;
  entity: string;
  entityId: string;
  operation: SyncOperationKind;
  payload: unknown;
  createdAt: string;
}

export type SyncPushOutcome =
  | { kind: "SYNCED"; record?: unknown }
  | { kind: "FAILED"; error: string }
  | { kind: "CONFLICT"; reason: string };

export interface SyncPushResult {
  idempotencyKey: string;
  outcome: SyncPushOutcome;
}

export interface SyncPushRequest {
  batch: SyncWireOperation[];
}

export interface SyncPushResponse {
  results: SyncPushResult[];
}

export type ConflictClass = "financial" | "sensitive" | "metadata";