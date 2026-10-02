import { describe, expect, it } from "vitest";
import {
  canDrop,
  daysLate,
  deadlineState,
  DEFAULT_BOARD_FILTERS,
  groupForBoard,
  matchesFilters,
  nextStatus,
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

  it("jamais en retard une fois livrée, annulée ou prête à retirer", () => {
    for (const status of ["DELIVERED", "CANCELLED", "READY_FOR_PICKUP"] as const) {
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
  it("une colonne par étape, annulées exclues, retard puis priorité d'abord", () => {
    const rows = [
      { order: order({ id: "normal", status: "SEWING", priority: "NORMAL", expected_at: "2026-10-20" }) },
      { order: order({ id: "urgent", status: "SEWING", priority: "URGENT", expected_at: "2026-10-20" }) },
      { order: order({ id: "late", status: "SEWING", priority: "LOW", expected_at: "2026-09-28" }) },
      { order: order({ id: "cancel", status: "CANCELLED" }) },
      { order: order({ id: "reg", status: "REGISTERED" }) },
    ];
    const board = groupForBoard(rows, DEFAULT_BOARD_FILTERS, TODAY);
    expect([...board.keys()]).toHaveLength(9);
    expect(board.has("CANCELLED")).toBe(false);
    expect(board.get("SEWING")?.map((r) => r.order.id)).toEqual(["late", "urgent", "normal"]);
    expect(board.get("REGISTERED")?.map((r) => r.order.id)).toEqual(["reg"]);
  });
});

describe("déplacements", () => {
  it("respecte les transitions du domaine et interdit l'annulation par glisser", () => {
    expect(canDrop("SEWING", "FITTING")).toBe(true);
    expect(canDrop("SEWING", "PREPARATION")).toBe(true);
    expect(canDrop("SEWING", "REGISTERED")).toBe(false);
    expect(canDrop("SEWING", "CANCELLED")).toBe(false);
    expect(canDrop("DELIVERED", "SEWING")).toBe(false);
  });

  it("étape suivante du flux", () => {
    expect(nextStatus("REGISTERED")).toBe("FABRIC_RECEIVED");
    expect(nextStatus("READY_FOR_PICKUP")).toBe("DELIVERED");
    expect(nextStatus("DELIVERED")).toBeNull();
    expect(nextStatus("CANCELLED")).toBeNull();
  });
});
