import type { SyncOperation } from "./types";

export const MAX_PUSH_BATCH = 50;

export const MAX_RETRY_COUNT = 5;

export const BACKOFF_MS: readonly number[] = [
  0,
  2_000,
  5_000,
  15_000,
  60_000,
  300_000,
];

export function backoffForAttempt(retryCount: number): number {
  const index = Math.min(Math.max(retryCount, 0), BACKOFF_MS.length - 1);
  return BACKOFF_MS[index];
}

export function shouldAttempt(nowMs: number, op: SyncOperation): boolean {
  if (op.status !== "PENDING" && op.status !== "SYNCING") return false;
  const withinBudget = op.retryCount < MAX_RETRY_COUNT;
  if (!withinBudget) return false;
  if (op.lastAttemptAt === null) return true;
  return nowMs - Date.parse(op.lastAttemptAt) >= backoffForAttempt(op.retryCount);
}

export function isRetryable(nowMs: number, op: SyncOperation): boolean {
  return op.retryCount < MAX_RETRY_COUNT;
}

export function hasRetryBudget(op: SyncOperation): boolean {
  return op.retryCount < MAX_RETRY_COUNT;
}