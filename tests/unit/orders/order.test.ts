import { describe, expect, it } from "vitest";
import {
  availableTransitions,
  canTransition,
  cancelledOrder,
  extractOrderSequence,
  isOrderReference,
  newOrderReference,
  nextOrderSequence,
  orderAfterTransition,
  transitionOrder,
  validateOrderItemDraft,
  type OrderRecord,
} from "@/domain/orders/order";

function order(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    id: "o1",
    tenant_id: "t1",
    customer_id: "c1",
    reference: "ORD-2026-000001",
    status: "REGISTERED",
    priority: "NORMAL",
    total_price: 0,
    expected_at: null,
    delivered_at: null,
    employee_id: null,
    notes: null,
    created_by: "u1",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    deleted_at: null,
    ...overrides,
  };
}

describe("références de commandes", () => {
  it("génère et valide le format ORD-YYYY-XXXXXX", () => {
    const ref = newOrderReference(2026, 1);
    expect(ref).toBe("ORD-2026-000001");
    expect(isOrderReference(ref)).toBe(true);
    expect(isOrderReference("ORD-2026-1")).toBe(false);
    expect(extractOrderSequence(ref)).toBe(1);
  });

  it("déduit la séquence suivante de l'existant", () => {
    expect(
      nextOrderSequence(2026, ["ORD-2026-000001", "ORD-2026-000003", "ORD-2025-000001"]),
    ).toBe(4);
    expect(nextOrderSequence(2026, [])).toBe(1);
  });
});

describe("machine à états", () => {
  it("progresse en avant et saute des étapes directement", () => {
    expect(canTransition("REGISTERED", "SEWING")).toBe(true);
    expect(canTransition("SEWING", "COMPLETED")).toBe(true);
    expect(canTransition("FITTING", "DELIVERED")).toBe(true);
  });

  it("autorise le retour en arrière (reprise d'atelier)", () => {
    expect(canTransition("READY_FOR_PICKUP", "SEWING")).toBe(true);
    expect(canTransition("ALTERATION", "FITTING")).toBe(true);
    expect(canTransition("COMPLETED", "FITTING")).toBe(true);
  });

  it("interdit les retours excessifs et les transitions identiques", () => {
    expect(canTransition("SEWING", "REGISTERED")).toBe(false);
    expect(canTransition("REGISTERED", "REGISTERED")).toBe(false);
  });

  it("considère DELIVERED et CANCELLED comme terminaux", () => {
    expect(canTransition("DELIVERED", "REGISTERED")).toBe(false);
    expect(canTransition("CANCELLED", "FABRIC_RECEIVED")).toBe(false);
  });

  it("annule depuis n'importe quel état non terminal, raison obligatoire", () => {
    const t1 = transitionOrder(order(), "CANCELLED", {
      changedBy: "u1",
      note: null,
      now: "2026-02-01T00:00:00.000Z",
      historyId: "h1",
    });
    expect(t1.ok).toBe(false);
    if (!t1.ok) expect(t1.reason).toContain("raison");

    const t2 = transitionOrder(order(), "CANCELLED", {
      changedBy: "u1",
      note: "Client a renoncé",
      now: "2026-02-01T00:00:00.000Z",
      historyId: "h1",
    });
    expect(t2.ok).toBe(true);
    if (t2.ok) {
      expect(t2.result.history.to_status).toBe("CANCELLED");
      expect(t2.result.history.from_status).toBe("REGISTERED");
    }
  });

  it("refuse une transition non autorisée", () => {
    const t = transitionOrder(order({ status: "SEWING" }), "REGISTERED", {
      changedBy: "u1",
      note: null,
      now: "2026-02-01T00:00:00.000Z",
      historyId: "h1",
    });
    expect(t.ok).toBe(false);
  });

  it("liste les transitions disponibles avec leur nature", () => {
    const list = availableTransitions("FITTING");
    const to = list.map((t) => t.to);
    expect(to).toContain("ALTERATION");
    expect(to).toContain("SEWING");
    expect(to).toContain("CANCELLED");
    expect(to).not.toContain("REGISTERED");
    expect(list.find((t) => t.to === "SEWING")?.kind).toBe("backward");
    expect(list.find((t) => t.to === "COMPLETED")?.kind).toBe("forward");
  });

  it("marque delivered_at au passage en DELIVERED", () => {
    const updated = orderAfterTransition(order({ status: "READY_FOR_PICKUP" }), "DELIVERED", "2026-03-01T00:00:00.000Z");
    expect(updated.status).toBe("DELIVERED");
    expect(updated.delivered_at).toBe("2026-03-01T00:00:00.000Z");
  });

  it("annule sans détruire", () => {
    const cancelled = cancelledOrder(order(), "2026-02-01T00:00:00.000Z");
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.id).toBe("o1");
  });
});

describe("validateOrderItemDraft", () => {
  it("accepte un article valide", () => {
    const r = validateOrderItemDraft({
      description: "Robe de mariée",
      quantity: 1,
      unit_price: 25000,
    });
    expect(r.ok).toBe(true);
  });

  it("rejette description vide, quantité ou prix invalides", () => {
    const r = validateOrderItemDraft({
      description: "  ",
      quantity: 0,
      unit_price: -5,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.description).toBeTruthy();
      expect(r.errors.quantity).toBeTruthy();
      expect(r.errors.unit_price).toBeTruthy();
    }
  });
});