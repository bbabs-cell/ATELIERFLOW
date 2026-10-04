import { describe, expect, it } from "vitest";
import type { Customer } from "@/domain/clients/customer";
import type { OrderRecord } from "@/domain/orders/order";
import type { PaymentRecord } from "@/domain/orders/payments";
import {
  buildMonthlyReport,
  daysInMonth,
  evolutionPercent,
  monthKeyOf,
  monthLabel,
  monthlyReportCsv,
  recentMonths,
  shiftMonth,
} from "@/domain/reports/monthly";

const customer = (id: string, name: string, created = "2026-09-02T10:00:00.000Z"): Customer => ({
  id,
  tenant_id: "t1",
  full_name: name,
  phone: null,
  whatsapp: null,
  email: null,
  address: null,
  notes: null,
  photo_key: null,
  status: "ACTIVE",
  created_by: null,
  created_at: created,
  updated_at: created,
  deleted_at: null,
});

const order = (id: string, over: Partial<OrderRecord> = {}): OrderRecord => ({
  id,
  tenant_id: "t1",
  customer_id: "c1",
  reference: `ORD-2026-00000${id.slice(1)}`,
  status: "SEWING",
  priority: "NORMAL",
  total_price: 50_000,
  expected_at: null,
  delivered_at: null,
  employee_id: null,
  notes: null,
  created_by: null,
  created_at: "2026-10-03T10:00:00.000Z",
  updated_at: "2026-10-03T10:00:00.000Z",
  deleted_at: null,
  ...over,
});

let seq = 0;
const payment = (orderId: string, amount: number, at: string, over: Partial<PaymentRecord> = {}): PaymentRecord => ({
  id: `p${++seq}`,
  tenant_id: "t1",
  order_id: orderId,
  amount,
  method: "CASH",
  status: "VALID",
  idempotency_key: `k${seq}`,
  recorded_by: null,
  note: null,
  cancelled_by: null,
  cancelled_at: null,
  cancellation_reason: null,
  created_at: at,
  updated_at: at,
  ...over,
});

const customers = [customer("c1", "Awa Diop"), customer("c2", "Moussa Ba", "2026-10-05T10:00:00.000Z")];
const orders = [
  order("o1"),
  order("o2", { customer_id: "c2", total_price: 30_000, status: "DELIVERED", delivered_at: "2026-10-20T10:00:00.000Z" }),
  order("o3", { status: "CANCELLED" }),
  order("o4", { total_price: 20_000, created_at: "2026-09-10T10:00:00.000Z" }),
];
const payments = [
  payment("o1", 20_000, "2026-10-03T11:00:00.000Z"),
  payment("o2", 30_000, "2026-10-20T11:00:00.000Z", { method: "WAVE" }),
  payment("o1", 5_000, "2026-10-21T11:00:00.000Z", { status: "CANCELLED" }),
  payment("o4", 10_000, "2026-09-15T11:00:00.000Z"),
  payment("o4", 4_000, "2026-10-01T09:00:00.000Z", { method: "WAVE" }),
];

describe("mois", () => {
  it("calcule les mois et leurs libellés", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(daysInMonth("2028-02")).toBe(29);
    expect(monthLabel("2026-10")).toBe("octobre 2026");
    expect(recentMonths("2026-02", 3)).toEqual(["2026-02", "2026-01", "2025-12"]);
  });

  it("tient compte du fuseau de l'atelier", () => {
    expect(monthKeyOf("2026-10-31T23:30:00.000Z", "UTC")).toBe("2026-10");
    expect(monthKeyOf("2026-10-31T23:30:00.000Z", "Europe/Paris")).toBe("2026-11");
  });
});

describe("rapport mensuel", () => {
  const report = buildMonthlyReport({ month: "2026-10", orders, payments, customers, timeZone: "UTC" });

  it("encaissé = paiements valides du mois, comparé au mois précédent", () => {
    expect(report.collected).toBe(54_000);
    expect(report.paymentsCount).toBe(3);
    expect(report.previousCollected).toBe(10_000);
    expect(evolutionPercent(report.collected, report.previousCollected)).toBe(440);
    expect(evolutionPercent(10, 0)).toBeNull();
  });

  it("facturé, livrées, annulées, reste à encaisser", () => {
    expect(report.invoiced).toBe(80_000);
    expect(report.ordersCreated).toBe(2);
    expect(report.ordersDelivered).toBe(1);
    expect(report.ordersCancelled).toBe(1);
    expect(report.outstandingFromMonth).toBe(30_000);
    // o1 : 30 000 + o4 : 20 000 - 14 000 = 6 000
    expect(report.outstandingToday).toBe(36_000);
    expect(report.newCustomers).toBe(1);
  });

  it("répartit par jour, par moyen et par client", () => {
    expect(report.daily).toHaveLength(31);
    expect(report.daily[0]).toBe(4_000);
    expect(report.daily[2]).toBe(20_000);
    expect(report.daily[19]).toBe(30_000);
    expect(report.byMethod).toEqual([
      { method: "WAVE", amount: 34_000, count: 2 },
      { method: "CASH", amount: 20_000, count: 1 },
    ]);
    expect(report.topCustomers.map((c) => [c.name, c.amount])).toEqual([
      ["Moussa Ba", 30_000],
      ["Awa Diop", 24_000],
    ]);
  });

  it("liste les paiements du mois dans l'ordre, annulés compris", () => {
    expect(report.payments.map((p) => [p.orderReference, p.amount, p.cancelled])).toEqual([
      ["ORD-2026-000004", 4_000, false],
      ["ORD-2026-000001", 20_000, false],
      ["ORD-2026-000002", 30_000, false],
      ["ORD-2026-000001", 5_000, true],
    ]);
  });

  it("mois vide", () => {
    const empty = buildMonthlyReport({ month: "2025-01", orders, payments, customers, timeZone: "UTC" });
    expect(empty.collected).toBe(0);
    expect(empty.topCustomers).toEqual([]);
    expect(empty.outstandingToday).toBe(36_000);
  });
});

describe("export Excel", () => {
  const report = buildMonthlyReport({ month: "2026-10", orders, payments, customers: [...customers, customer("c3", "=HYPERLINK(\"x\");Ba")], timeZone: "UTC" });
  const csv = monthlyReportCsv(report, { atelierName: "Atelier Fatou; Dakar", currency: "XOF", methodLabel: (m) => m, timeZone: "UTC" });

  it("BOM UTF-8, point-virgule, lignes Windows", () => {
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("\r\nEncaissé;54000\r\n");
    expect(csv).toContain('"Atelier Fatou; Dakar"');
    expect(csv).toContain("03/10/2026 11:00;ORD-2026-000001;Awa Diop;CASH;20000;Valide");
    expect(csv).toContain("ORD-2026-000001;Awa Diop;CASH;5000;Annulé");
  });

  it("neutralise les formules dans les textes", () => {
    const withFormula = monthlyReportCsv(report, { atelierName: "=1+1", currency: "XOF", methodLabel: (m) => m });
    expect(withFormula).toContain(";'=1+1");
    expect(withFormula).not.toMatch(/;=1\+1/);
  });
});
