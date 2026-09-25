import { describe, expect, it } from "vitest";
import {
  backoffForAttempt,
  MAX_RETRY_COUNT,
  shouldAttempt,
} from "@/domain/sync/queuePolicy";
import type { SyncOperation } from "@/domain/sync/types";

const T0 = Date.parse("2026-09-24T10:00:00.000Z");

function op(overrides: Partial<SyncOperation> = {}): SyncOperation {
  return {
    idempotencyKey: "00000000-0000-0000-0000-000000000000",
    tenantId: "t",
    profileId: null,
    entity: "customers",
    entityId: "c1",
    operation: "INSERT",
    payload: {},
    createdAt: new Date(T0).toISOString(),
    status: "PENDING",
    retryCount: 0,
    lastAttemptAt: null,
    lastError: null,
    ...overrides,
  };
}

describe("queuePolicy", () => {
  it("first attempt is allowed immediately", () => {
    expect(shouldAttempt(T0, op())).toBe(true);
  });

  it("applies progressive backoff after failures", () => {
    const retryable = op({ retryCount: 1, lastAttemptAt: new Date(T0).toISOString() });
    expect(shouldAttempt(T0, retryable)).toBe(false);
    expect(shouldAttempt(T0 + 1_999, retryable)).toBe(false);
    expect(shouldAttempt(T0 + 2_000, retryable)).toBe(true);
  });

  it("caps the number of attempts", () => {
    const exhausted = op({ retryCount: MAX_RETRY_COUNT });
    expect(shouldAttempt(T0, exhausted)).toBe(false);
  });

  it("exposes the backoff schedule indexed by attempt", () => {
    expect(backoffForAttempt(0)).toBe(0);
    expect(backoffForAttempt(1)).toBe(2_000);
    expect(backoffForAttempt(6)).toBe(300_000);
    expect(backoffForAttempt(99)).toBe(300_000);
  });

  it("never retries terminal statuses", () => {
    expect(shouldAttempt(T0, op({ status: "SYNCED" }))).toBe(false);
    expect(shouldAttempt(T0, op({ status: "FAILED" }))).toBe(false);
    expect(shouldAttempt(T0, op({ status: "CONFLICT" }))).toBe(false);
  });
});