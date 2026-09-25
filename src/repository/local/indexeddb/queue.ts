import type { SyncOperation, SyncStatus } from "@/domain/sync/types";
import { shouldAttempt } from "@/domain/sync/queuePolicy";
import type { SyncQueuePort } from "@/repository/ports/sync";
import {
  idbDelete,
  idbGet,
  idbGetAll,
  idbGetAllByIndex,
  idbPut,
  idbPutMany,
  META_STORE,
  OPERATIONS_STORE,
  openTenantDb,
} from "./db";

export class IndexedDbSyncQueue implements SyncQueuePort {
  private readonly dbPromise: Promise<IDBDatabase>;

  constructor(tenantId: string) {
    this.dbPromise = openTenantDb(tenantId);
  }

  async enqueue(op: SyncOperation): Promise<void> {
    const db = await this.dbPromise;
    await idbPut(db, OPERATIONS_STORE, op);
  }

  async pending(limit: number, nowMs: number): Promise<SyncOperation[]> {
    const db = await this.dbPromise;
    const all = await idbGetAll<SyncOperation>(db, OPERATIONS_STORE);
    return all
      .filter((op) => shouldAttempt(nowMs, op))
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
      .slice(0, limit);
  }

  async markSyncing(
    idempotencyKeys: string[],
    attemptedAt: string,
  ): Promise<SyncOperation[]> {
    const db = await this.dbPromise;
    const updated: SyncOperation[] = [];
    for (const key of idempotencyKeys) {
      const op = await idbGet<SyncOperation>(db, OPERATIONS_STORE, key);
      if (!op) continue;
      const next: SyncOperation = {
        ...op,
        status: "SYNCING",
        retryCount: op.retryCount + 1,
        lastAttemptAt: attemptedAt,
        lastError: null,
      };
      updated.push(next);
    }
    if (updated.length > 0) await idbPutMany(db, OPERATIONS_STORE, updated);
    return updated;
  }

  async requeue(idempotencyKeys: string[]): Promise<void> {
    const db = await this.dbPromise;
    for (const key of idempotencyKeys) {
      const op = await idbGet<SyncOperation>(db, OPERATIONS_STORE, key);
      if (!op || op.status !== "SYNCING") continue;
      await idbPut(db, OPERATIONS_STORE, { ...op, status: "PENDING" });
    }
  }

  async resolve(
    idempotencyKey: string,
    status: Extract<SyncStatus, "SYNCED" | "FAILED" | "CONFLICT">,
    error: string | null,
  ): Promise<void> {
    const db = await this.dbPromise;
    const op = await idbGet<SyncOperation>(db, OPERATIONS_STORE, idempotencyKey);
    if (!op) return;
    await idbPut(db, OPERATIONS_STORE, {
      ...op,
      status,
      lastError: error ?? (status === "SYNCED" ? null : op.lastError),
    });
  }

  async requeueStuck(cutoffMs: number): Promise<number> {
    const db = await this.dbPromise;
    const syncing = await idbGetAllByIndex<SyncOperation>(
      db,
      OPERATIONS_STORE,
      "status",
      "SYNCING",
    );
    const stuck = syncing.filter(
      (op) => op.lastAttemptAt !== null && Date.parse(op.lastAttemptAt) < cutoffMs,
    );
    if (stuck.length === 0) return 0;
    await idbPutMany(
      db,
      OPERATIONS_STORE,
      stuck.map((op) => ({ ...op, status: "PENDING" })),
    );
    return stuck.length;
  }

  async listAll(): Promise<SyncOperation[]> {
    const db = await this.dbPromise;
    const all = await idbGetAll<SyncOperation>(db, OPERATIONS_STORE);
    return all
      .filter((op) => !["FAILED", "CONFLICT", "SYNCED"].includes(op.status))
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  }

  async drop(idempotencyKey: string): Promise<void> {
    const db = await this.dbPromise;
    await idbDelete(db, OPERATIONS_STORE, idempotencyKey);
  }

  async clearMeta(): Promise<void> {
    const db = await this.dbPromise;
    const meta = await idbGetAll<{ key: string }>(db, META_STORE);
    for (const entry of meta) {
      await idbDelete(db, META_STORE, entry.key);
    }
  }
}

export function createIndexedDbQueue(tenantId: string): SyncQueuePort {
  return new IndexedDbSyncQueue(tenantId);
}