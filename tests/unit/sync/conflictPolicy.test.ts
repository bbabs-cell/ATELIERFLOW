import { describe, expect, it } from "vitest";
import {
  classifyEntity,
  isFinancialEntity,
  requiresManualReview,
  serverIsReference,
} from "@/domain/sync/conflictPolicy";

describe("conflictPolicy", () => {
  it("classifies financial entities", () => {
    expect(classifyEntity("payments")).toBe("financial");
    expect(classifyEntity("receipts")).toBe("financial");
    expect(classifyEntity("subscriptions")).toBe("financial");
    expect(classifyEntity("order_status_history")).toBe("financial");
    expect(classifyEntity("stock_movements")).toBe("financial");
  });

  it("classifies sensitive entities", () => {
    expect(classifyEntity("orders")).toBe("sensitive");
    expect(classifyEntity("customers")).toBe("sensitive");
    expect(classifyEntity("measurement_profiles")).toBe("sensitive");
  });

  it("classifies metadata entities as server reference", () => {
    expect(classifyEntity("tenant_settings")).toBe("metadata");
    expect(classifyEntity("sync_flags")).toBe("metadata");
    expect(serverIsReference("tenant_settings")).toBe(true);
    expect(serverIsReference("payments")).toBe(false);
  });

  it("never allows automatic last-write-wins on financial or sensitive data", () => {
    expect(requiresManualReview("payments")).toBe(true);
    expect(requiresManualReview("orders")).toBe(true);
    expect(requiresManualReview("tenant_settings")).toBe(false);
    expect(isFinancialEntity("payments")).toBe(true);
    expect(isFinancialEntity("orders")).toBe(false);
  });
});