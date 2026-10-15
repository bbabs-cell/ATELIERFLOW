import { describe, expect, it } from "vitest";
import {
  canDrop,
  daysLate,
  deadlineState,
  DEFAULT_BOARD_FILTERS,
  groupForBoard,
  deadlineWords,
  matchesFilters,
} from "@/domain/orders/board";
import type { OrderRecord } from "@/domain/orders/order";

const TODAY = "2026-10-02T09:00:00.000Z";

function order(over: Partial<OrderRecord>): OrderRecord {
  return {
    id: over.id ?? "o",
    tenant_id: "t",
    customer_id: "c",
    reference: "ORD-2026-000001",
    status: "SEWING",
    priority: "NORMAL",
    total_price: 50000,
    expected_at: null,
    delivered_at: null,
    employee_id: null,
    notes: null,
    created_by: null,
    created_at: "2026-09-20T10:00:00.000Z",
    updated_at: "2026-09-20T10:00:00.000Z",
    deleted_at: null,
    ...over,
  };
}

describe("deadlineState", () => {
  it("classe retard, aujourd'hui, bientôt, ok", () => {
    expect(deadlineState(order({ expected_at: "2026-10-01" }), TODAY)).toBe("late");
    expect(deadlineState(order({ expected_at: "2026-10-02" }), TODAY)).toBe("today");
    expect(deadlineState(order({ expected_at: "2026-10-04" }), TODAY)).toBe("soon");
    expect(deadlineState(order({ expected_at: "2026-10-10" }), TODAY)).toBe("ok");
    expect(deadlineState(order({ expected_at: null }), TODAY)).toBe("none");
  });

  it("jamais en retard une fois livrée, annulée ou prête", () => {
    for (const status of ["DELIVERED", "CANCELLED", "READY_FOR_PICKUP", "COMPLETED"] as const) {
      expect(deadlineState(order({ status, expected_at: "2026-09-01" }), TODAY)).toBe("none");
    }
  });

  it("compte les jours de retard (passage de mois)", () => {
    expect(daysLate(order({ expected_at: "2026-09-29" }), TODAY)).toBe(3);
    expect(daysLate(order({ expected_at: "2026-10-05" }), TODAY)).toBe(0);
  });
});

describe("filtres", () => {
  it("priorité, affectation, non affectée, retards", () => {
    const o = order({ priority: "URGENT", employee_id: "p1", expected_at: "2026-09-30" });
    expect(matchesFilters(o, DEFAULT_BOARD_FILTERS, TODAY)).toBe(true);
    expect(matchesFilters(o, { ...DEFAULT_BOARD_FILTERS, priority: "LOW" }, TODAY)).toBe(false);
    expect(matchesFilters(o, { ...DEFAULT_BOARD_FILTERS, assignee: "p1" }, TODAY)).toBe(true);
    expect(matchesFilters(o, { ...DEFAULT_BOARD_FILTERS, assignee: "p2" }, TODAY)).toBe(false);
    expect(matchesFilters(o, { ...DEFAULT_BOARD_FILTERS, assignee: "UNASSIGNED" }, TODAY)).toBe(false);
    expect(matchesFilters(order({}), { ...DEFAULT_BOARD_FILTERS, assignee: "UNASSIGNED" }, TODAY)).toBe(true);
    expect(matchesFilters(o, { ...DEFAULT_BOARD_FILTERS, lateOnly: true }, TODAY)).toBe(true);
    expect(matchesFilters(order({ expected_at: "2026-10-20" }), { ...DEFAULT_BOARD_FILTERS, lateOnly: true }, TODAY)).toBe(false);
  });
});

describe("groupForBoard", () => {
  it("4 colonnes (Reçue, En couture, Prête, Livrée), annulées exclues, retard puis priorité d'abord", () => {
    const rows = [
      { order: order({ id: "normal", status: "SEWING", priority: "NORMAL", expected_at: "2026-10-20" }) },
      { order: order({ id: "urgent", status: "SEWING", priority: "URGENT", expected_at: "2026-10-20" }) },
      { order: order({ id: "late", status: "FITTING", priority: "LOW", expected_at: "2026-09-28" }) },
      { order: order({ id: "cancel", status: "CANCELLED" }) },
      { order: order({ id: "reg", status: "REGISTERED" }) },
      { order: order({ id: "tissu", status: "FABRIC_RECEIVED" }) },
      { order: order({ id: "fini", status: "COMPLETED" }) },
    ];
    const board = groupForBoard(rows, DEFAULT_BOARD_FILTERS, TODAY);
    expect([...board.keys()]).toEqual(["RECEIVED", "SEWING", "READY", "DELIVERED"]);
    expect(board.get("SEWING")?.map((r) => r.order.id)).toEqual(["late", "urgent", "normal"]);
    expect(board.get("RECEIVED")?.map((r) => r.order.id).sort()).toEqual(["reg", "tissu"]);
    expect(board.get("READY")?.map((r) => r.order.id)).toEqual(["fini"]);
  });
});

describe("déplacements", () => {
  it("vers l'étape suivante ou précédente, jamais depuis une commande livrée ou annulée", () => {
    expect(canDrop("REGISTERED", "SEWING")).toBe(true);
    expect(canDrop("REGISTERED", "READY")).toBe(true);
    expect(canDrop("SEWING", "RECEIVED")).toBe(true);
    expect(canDrop("FITTING", "RECEIVED")).toBe(true);
    expect(canDrop("SEWING", "SEWING")).toBe(false);
    expect(canDrop("READY_FOR_PICKUP", "RECEIVED")).toBe(false);
    expect(canDrop("DELIVERED", "SEWING")).toBe(false);
    expect(canDrop("CANCELLED", "SEWING")).toBe(false);
  });
});

describe("échéance en mots", () => {
  it("retard, aujourd'hui, demain, dans n jours, puis la date", () => {
    expect(deadlineWords(order({ expected_at: "2026-09-30" }), TODAY)?.text).toBe("En retard de 2 jours");
    expect(deadlineWords(order({ expected_at: "2026-10-01" }), TODAY)?.text).toBe("En retard de 1 jour");
    expect(deadlineWords(order({ expected_at: "2026-10-02" }), TODAY)?.text).toBe("Aujourd'hui");
    expect(deadlineWords(order({ expected_at: "2026-10-03" }), TODAY)?.text).toBe("Demain");
    expect(deadlineWords(order({ expected_at: "2026-10-06" }), TODAY)?.text).toBe("Dans 4 jours");
    expect(deadlineWords(order({ expected_at: "2026-10-24" }), TODAY)?.text).toBe("Le 24 octobre");
    expect(deadlineWords(order({ expected_at: null }), TODAY)).toBeNull();
    expect(deadlineWords(order({ status: "READY_FOR_PICKUP", expected_at: "2026-09-01" }), TODAY)).toBeNull();
  });
});
