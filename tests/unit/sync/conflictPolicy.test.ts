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
import { adoptServerRecord } from "@/domain/sync/conflictPolicy";

describe("adoptServerRecord (après SYNCED)", () => {
  it("reçu : la référence et l'état calculés par le serveur remplacent la copie locale", () => {
    const local = { id: "r", reference: "REC-2026-000001", state: { remaining: 30000 }, pdf_key: null };
    const server = { id: "r", reference: "REC-2026-000002", state: { remaining: 25000 } };
    expect(adoptServerRecord("receipts", local, server)).toEqual({ id: "r", reference: "REC-2026-000002", state: { remaining: 25000 }, pdf_key: null });
  });

  it("commande : seule la référence ORD définitive est reprise", () => {
    const local = { id: "o", reference: "ORD-2026-000001", notes: "saisie locale", total_price: 50000 };
    const server = { id: "o", reference: "ORD-2026-000004", notes: null, total_price: 50000 };
    expect(adoptServerRecord("orders", local, server)).toEqual({ id: "o", reference: "ORD-2026-000004", notes: "saisie locale", total_price: 50000 });
    expect(adoptServerRecord("orders", local, { ...server, reference: "ORD-2026-000001" })).toBeNull();
  });

  it("métadonnées : version serveur ; autres entités sensibles : copie locale conservée", () => {
    expect(adoptServerRecord("notifications", { a: 1 }, { a: 2 })).toEqual({ a: 2 });
    expect(adoptServerRecord("customers", { phone: "1" }, { phone: "2" })).toBeNull();
    expect(adoptServerRecord("payments", { amount: 1 }, { amount: 1 })).toBeNull();
    expect(adoptServerRecord("receipts", {}, null)).toBeNull();
  });
});
