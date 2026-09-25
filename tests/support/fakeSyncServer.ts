import type { SyncPushResponse, SyncWireOperation } from "@/domain/sync/types";

export type ServerOutcome =
  | { kind: "SYNCED"; record: unknown }
  | { kind: "FAILED"; error: string }
  | { kind: "CONFLICT"; reason: string };

export interface FakeSyncServer {
  push: (request: { batch: SyncWireOperation[] }) => Promise<SyncPushResponse>;
  pushed: () => SyncWireOperation[];
  pushedCount: (idempotencyKey: string) => number;
  appliedCount: (idempotencyKey: string) => number;
  appliedRecord: (idempotencyKey: string) => unknown | undefined;
  failKey: (idempotencyKey: string, error: string) => void;
  conflictKey: (idempotencyKey: string, reason: string) => void;
  loseResponseNext: () => void;
  dropConnectionNext: () => void;
}

export function createFakeSyncServer(): FakeSyncServer {
  const pushed = new Map<string, number>();
  const applied = new Map<string, { record: unknown }>();
  const conflicts = new Map<string, string>();
  const failures = new Map<string, string>();
  const pushedOps: SyncWireOperation[] = [];
  let loseResponse = false;
  let dropConnection = false;

  const serverApplies = (op: SyncWireOperation): ServerOutcome => {
    pushed.set(op.idempotencyKey, (pushed.get(op.idempotencyKey) ?? 0) + 1);
    pushedOps.push(op);
    const existing = applied.get(op.idempotencyKey);
    if (existing) {
      return { kind: "SYNCED", record: existing.record };
    }
    const record = { ...(op.payload as object), serverRef: true };
    applied.set(op.idempotencyKey, { record });
    return { kind: "SYNCED", record };
  };

  const respond = (op: SyncWireOperation): SyncPushResponse["results"][number] => {
    const conflict = conflicts.get(op.idempotencyKey);
    if (conflict) {
      return {
        idempotencyKey: op.idempotencyKey,
        outcome: { kind: "CONFLICT", reason: conflict },
      };
    }
    const failure = failures.get(op.idempotencyKey);
    if (failure) {
      return {
        idempotencyKey: op.idempotencyKey,
        outcome: { kind: "FAILED", error: failure },
      };
    }
    return { idempotencyKey: op.idempotencyKey, outcome: serverApplies(op) };
  };

  return {
    pushed: () => pushedOps.slice(),
    pushedCount: (key) => pushed.get(key) ?? 0,
    appliedCount: (key) => (applied.has(key) ? 1 : 0),
    appliedRecord: (key) => applied.get(key)?.record,
    failKey: (key, error) => failures.set(key, error),
    conflictKey: (key, reason) => conflicts.set(key, reason),
    loseResponseNext: () => {
      loseResponse = true;
    },
    dropConnectionNext: () => {
      dropConnection = true;
    },
    push: async (request) => {
      if (dropConnection) {
        dropConnection = false;
        throw new Error("connection dropped");
      }
      const results = request.batch.map(respond);
      if (loseResponse) {
        loseResponse = false;
        throw new Error("response lost after server apply");
      }
      return { results };
    },
  };
}