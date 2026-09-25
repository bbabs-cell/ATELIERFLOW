import { describe, expect, it } from "vitest";
import { isIdempotencyKey, newIdempotencyKey } from "@/domain/ids/idempotency";

describe("idempotency", () => {
  it("generates valid uuid v4 keys", () => {
    const key = newIdempotencyKey();
    expect(isIdempotencyKey(key)).toBe(true);
    expect(key[14]).toBe("4");
  });

  it("generates distinct keys", () => {
    expect(newIdempotencyKey()).not.toBe(newIdempotencyKey());
  });

  it("rejects malformed keys", () => {
    expect(isIdempotencyKey("")).toBe(false);
    expect(isIdempotencyKey("not-a-uuid")).toBe(false);
    expect(isIdempotencyKey("00000000-0000-0000-0000-00000000000g")).toBe(false);
  });
});