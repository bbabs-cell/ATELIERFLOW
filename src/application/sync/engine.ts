import type {
  SyncOperation,
  SyncOperationKind,
} from "@/domain/sync/types";
import { isIdempotencyKey, newIdempotencyKey } from "@/domain/ids/idempotency";
import { MAX_PUSH_BATCH, shouldAttempt } from "@/domain/sync/queuePolicy";
import { adoptServerRecord } from "@/domain/sync/conflictPolicy";
import {
  toWireOperation,
  type LocalCachePort,
  type RemoteSyncPort,
  type SyncQueuePort,
} from "@/repository/ports/sync";

export interface SyncEngineHandlers {
  onSynced?: (op: SyncOperation) => void;
  onFailed?: (op: SyncOperation, error: string) => void;
  onConflict?: (op: SyncOperation, reason: string) => void;
  onBusyChange?: (busy: boolean) => void;
}

export interface SyncEngineDeps {
  queue: SyncQueuePort;
  cache: LocalCachePort;
  remote: RemoteSyncPort;
  handlers?: SyncEngineHandlers;
  batchSize?: number;
  stuckSyncingMs?: number;
  now?: () => number;
  uuid?: () => string;
}

export interface EnqueueInput {
  tenantId: string;
  profileId: string | null;
  entity: string;
  entityId: string;
  operation: SyncOperationKind;
  payload: unknown;
  /** Horodatage d'origine (renvoi d'une opération refusée : garde l'ordre). */
  createdAt?: string;
}

export interface SyncEngineStatus {
  busy: boolean;
  pending: number;
}

export type SyncEngineStatusListener = (status: SyncEngineStatus) => void;

export interface FlushReport {
  attempted: number;
  synced: number;
  skippedBackoff: number;
  failed: number;
  conflicted: number;
  networkError: string | null;
}

export class SyncEngine {
  private readonly queue: SyncQueuePort;
  private readonly cache: LocalCachePort;
  private readonly remote: RemoteSyncPort;
  private readonly handlers: SyncEngineHandlers;
  private readonly batchSize: number;
  private readonly stuckSyncingMs: number;
  private readonly now: () => number;
  private readonly uuid: () => string;
  private inFlight = false;
  private readonly statusListeners = new Set<SyncEngineStatusListener>();
  private status: SyncEngineStatus = { busy: false, pending: 0 };

  constructor(deps: SyncEngineDeps) {
    this.queue = deps.queue;
    this.cache = deps.cache;
    this.remote = deps.remote;
    this.handlers = deps.handlers ?? {};
    this.batchSize = deps.batchSize ?? MAX_PUSH_BATCH;
    this.stuckSyncingMs = deps.stuckSyncingMs ?? 30_000;
    this.now = deps.now ?? (() => Date.now());
    this.uuid = deps.uuid ?? newIdempotencyKey;
  }

  async enqueue(input: EnqueueInput): Promise<SyncOperation> {
    const key = this.uuid();
    if (!isIdempotencyKey(key)) {
      throw new Error("IDEMPOTENCY_KEY_INVALID");
    }
    const op: SyncOperation = {
      idempotencyKey: key,
      tenantId: input.tenantId,
      profileId: input.profileId,
      entity: input.entity,
      entityId: input.entityId,
      operation: input.operation,
      payload: input.payload,
      createdAt: input.createdAt ?? new Date(this.now()).toISOString(),
      status: "PENDING",
      retryCount: 0,
      lastAttemptAt: null,
      lastError: null,
    };
    await this.queue.enqueue(op);
    this.bumpPending(1);
    return op;
  }

  async flush(): Promise<FlushReport> {
    if (this.inFlight) {
      return {
        attempted: 0,
        synced: 0,
        skippedBackoff: 0,
        failed: 0,
        conflicted: 0,
        networkError: null,
      };
    }
    this.inFlight = true;
    this.setStatus({ busy: true, pending: this.status.pending });
    try {
      await this.queue.requeueStuck(this.now() - this.stuckSyncingMs);
      const candidates = await this.queue.pending(this.batchSize, this.now());
      return await this.pump(candidates);
    } finally {
      this.inFlight = false;
      this.setStatus({ busy: false, pending: this.status.pending });
      this.handlers.onBusyChange?.(false);
    }
  }

  /**
   * Vrai quand aucune opération locale n'attend encore le serveur pour
   * cette entité : l'enregistrement en cache est la version confirmée.
   */
  /** Clés « entité:id » ayant au moins une opération locale non confirmée. */
  async unsettledKeys(): Promise<Set<string>> {
    const ops = await this.queue.listAll();
    return new Set(ops.filter((op) => op.status !== "SYNCED").map((op) => `${op.entity}:${op.entityId}`));
  }

  async isSettled(entity: string, entityId: string): Promise<boolean> {
    const ops = await this.queue.listAll();
    return !ops.some((op) => op.entity === entity && op.entityId === entityId && op.status !== "SYNCED");
  }

  /** Opérations refusées par le serveur pour une limite ou une fonction du plan (0022). */
  async planRefusals(): Promise<SyncOperation[]> {
    const ops = await this.queue.listFailed();
    return ops.filter((op) => isPlanRefusal(op.lastError));
  }

  /**
   * Renvoie les opérations refusées (par exemple après un changement de
   * plan). Le serveur garde la réponse d'une clé d'idempotence : chaque
   * opération repart avec une NOUVELLE clé, à sa date d'origine, et
   * l'ancienne est retirée. Les opérations qui en dépendaient (refusées
   * en NOT_FOUND) repartent avec elles, dans le même ordre.
   */
  async retryRefused(): Promise<number> {
    const failed = await this.queue.listFailed();
    if (!failed.some((op) => isPlanRefusal(op.lastError))) return 0;
    const ops = failed.filter((op) => isPlanRefusal(op.lastError) || /^NOT_FOUND:/.test(op.lastError ?? ""));
    for (const op of ops) {
      await this.enqueue({
        tenantId: op.tenantId,
        profileId: op.profileId,
        entity: op.entity,
        entityId: op.entityId,
        operation: op.operation,
        payload: op.payload,
        createdAt: op.createdAt,
      });
      await this.queue.drop(op.idempotencyKey);
    }
    return ops.length;
  }

  subscribe(listener: SyncEngineStatusListener): () => void {
    this.statusListeners.add(listener);
    listener({ ...this.status });
    return () => this.statusListeners.delete(listener);
  }

  private bumpPending(delta: number): void {
    this.setStatus({
      busy: this.status.busy,
      pending: Math.max(0, this.status.pending + delta),
    });
  }

  private setStatus(next: SyncEngineStatus): void {
    this.status = next;
    for (const listener of this.statusListeners) {
      listener({ ...this.status });
    }
  }

  private async pump(candidates: SyncOperation[]): Promise<FlushReport> {
    const ready = candidates.filter((op) => shouldAttempt(this.now(), op));
    const report: FlushReport = {
      attempted: ready.length,
      synced: 0,
      skippedBackoff: candidates.length - ready.length,
      failed: 0,
      conflicted: 0,
      networkError: null,
    };
    if (ready.length === 0) return report;

    const attemptedAt = new Date(this.now()).toISOString();
    const syncing = await this.queue.markSyncing(
      ready.map((op) => op.idempotencyKey),
      attemptedAt,
    );
    const wireBatch = syncing.map((op) => toWireOperation(op));

    let response;
    try {
      response = await this.remote.push({ batch: wireBatch });
    } catch (error) {
      await this.queue.requeue(syncing.map((op) => op.idempotencyKey));
      report.networkError =
        error instanceof Error ? error.message : String(error);
      return report;
    }

    const byKey = new Map(
      response.results.map((r) => [r.idempotencyKey, r.outcome]),
    );
    const unresolved: string[] = [];

    for (const op of syncing) {
      const outcome = byKey.get(op.idempotencyKey);
      if (!outcome) {
        unresolved.push(op.idempotencyKey);
        continue;
      }
      if (outcome.kind === "SYNCED") {
        await this.resolveSynced(op, outcome.record);
        report.synced += 1;
      } else if (outcome.kind === "FAILED") {
        await this.queue.resolve(op.idempotencyKey, "FAILED", outcome.error);
        this.bumpPending(-1);
        report.failed += 1;
        this.handlers.onFailed?.(op, outcome.error);
      } else {
        await this.queue.resolve(
          op.idempotencyKey,
          "CONFLICT",
          outcome.reason,
        );
        this.bumpPending(-1);
        report.conflicted += 1;
        this.handlers.onConflict?.(op, outcome.reason);
      }
    }
    if (unresolved.length > 0) {
      await this.queue.requeue(unresolved);
    }
    return report;
  }

  private async resolveSynced(
    op: SyncOperation,
    serverRecord: unknown | undefined,
  ): Promise<void> {
    if (serverRecord !== undefined) {
      const local = await this.cache.get(op.entity, op.entityId);
      const adopted = adoptServerRecord(op.entity, local, serverRecord);
      if (adopted !== null) await this.cache.put(op.entity, op.entityId, adopted);
    }
    await this.queue.resolve(op.idempotencyKey, "SYNCED", null);
    this.bumpPending(-1);
    this.handlers.onSynced?.(op);
  }

  async onOnline(): Promise<FlushReport> {
    await this.queue.requeueStuck(this.now() - this.stuckSyncingMs);
    return this.flush();
  }
}

function isPlanRefusal(error: string | null): boolean {
  return typeof error === "string" && /^PLAN_(LIMIT|FEATURE):/.test(error);
}
