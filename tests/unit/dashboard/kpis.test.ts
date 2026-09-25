import { describe, expect, it } from "vitest";
import { aggregateDashboardKpis, buildRevenuePoints, dayDateRange } from "@/domain/dashboard/kpis";
import type {
  AppointmentRecord,
} from "@/domain/appointments/appointments";
import type { Customer } from "@/domain/clients/customer";
import type { FabricRecord } from "@/domain/inventory/fabrics";
import type { StockMovementRecord } from "@/domain/inventory/stock";
import type { OrderRecord } from "@/domain/orders/order";
import type { PaymentRecord } from "@/domain/orders/payments";
import type { TeamMemberRecord } from "@/domain/team/teamMember";

const T0 = "2026-02-10";
const RANGE = { from: "2026-02-01", to: "2026-02-10" };

const customer: Customer = {
  id: "c1",
  tenant_id: "t1",
  full_name: "Awa Diop",
  phone: null,
  whatsapp: null,
  email: null,
  address: null,
  notes: null,
  photo_key: null,
  status: "ACTIVE",
  created_by: null,
  created_at: `${T0}T08:00:00.000Z`,
  updated_at: `${T0}T08:00:00.000Z`,
  deleted_at: null,
};

const order: OrderRecord = {
  id: "o1",
  tenant_id: "t1",
  customer_id: "c1",
  reference: "ORD-2026-000001",
  status: "SEWING",
  priority: "NORMAL",
  total_price: 30_000,
  expected_at: "2026-02-09",
  delivered_at: null,
  employee_id: null,
  notes: null,
  created_by: null,
  created_at: `${T0}T08:00:00.000Z`,
  updated_at: `${T0}T08:00:00.000Z`,
  deleted_at: null,
};

const payment = (over: Partial<PaymentRecord> = {}): PaymentRecord => ({
  id: "p1",
  tenant_id: "t1",
  order_id: "o1",
  amount: 12_500,
  method: "CASH",
  status: "VALID",
  idempotency_key: "k1",
  recorded_by: null,
  note: null,
  cancelled_by: null,
  cancelled_at: null,
  cancellation_reason: null,
  created_at: `${T0}T09:00:00.000Z`,
  updated_at: `${T0}T09:00:00.000Z`,
  ...over,
});

const fabric: FabricRecord = {
  id: "f1",
  tenant_id: "t1",
  name: "Wax bleu",
  color: null,
  supplier: null,
  quantity: 80,
  unit: "m",
  unit_price: 2500,
  photo_key: null,
  status: "ACTIVE",
  created_at: `${T0}T08:00:00.000Z`,
  updated_at: `${T0}T08:00:00.000Z`,
  deleted_at: null,
};

const movement: StockMovementRecord = {
  id: "m1",
  tenant_id: "t1",
  fabric_id: "f1",
  type: "OUT",
  quantity: 250,
  balance_after: 80,
  reason: null,
  order_item_id: null,
  created_by: null,
  created_at: `${T0}T09:00:00.000Z`,
};

const appointment: AppointmentRecord = {
  id: "a1",
  tenant_id: "t1",
  customer_id: "c1",
  order_id: null,
  type: "FITTING",
  starts_at: `${T0}T14:00:00.000Z`,
  ends_at: null,
  status: "CONFIRMED",
  note: null,
  created_by: null,
  created_at: `${T0}T08:00:00.000Z`,
  updated_at: `${T0}T08:00:00.000Z`,
  deleted_at: null,
};

const member: TeamMemberRecord = {
  id: "tm1",
  tenant_id: "t1",
  full_name: "Awa Diop",
  phone: null,
  role: "OWNER",
  status: "ACTIVE",
  invited_by: null,
  joined_at: `${T0}T08:00:00.000Z`,
  created_at: `${T0}T08:00:00.000Z`,
  updated_at: `${T0}T08:00:00.000Z`,
};

function base() {
  return {
    customers: [customer],
    orders: [order],
    payments: [payment()],
    fabrics: [fabric],
    movements: [movement],
    appointments: [appointment],
    team: [member],
    range: RANGE,
    today: T0,
  };
}

describe("buildRevenuePoints", () => {
  it("ne comptabilise que les paiements VALID sur la période", () => {
    const points = buildRevenuePoints(
      [payment(), payment({ status: "CANCELLED", amount: 50_000 }), payment({ created_at: "2026-01-20T09:00:00.000Z" })],
      RANGE,
    );
    expect(points).toHaveLength(7);
    const total = points.reduce((acc, p) => acc + p.cents, 0);
    expect(total).toBe(12_500);
  });
});

describe("aggregateDashboardKpis", () => {
  it("calcule encaissé, facturé, reste à encaisser et compteurs", () => {
    const kpis = aggregateDashboardKpis(base());
    expect(kpis.money.revenuePeriodCents).toBe(12_500);
    expect(kpis.money.invoicedPeriodCents).toBe(30_000);
    expect(kpis.money.outstandingCents).toBe(17_500);
    expect(kpis.money.ordersActive).toBe(1);
    expect(kpis.money.ordersReadyPickup).toBe(0);
    expect(kpis.money.ordersLate).toBe(1);
    expect(kpis.context.customersActive).toBe(1);
    expect(kpis.context.customersNewPeriod).toBe(1);
    expect(kpis.context.appointmentsToday).toBe(1);
    expect(kpis.context.fabricsLow).toBe(1);
    expect(kpis.context.stockOutPeriodCenti).toBe(250);
    expect(kpis.context.teamActive).toBe(1);
  });

  it("gère une date d'échéance passée comme retard, DELIVERED non compté", () => {
    const kpis = aggregateDashboardKpis({
      ...base(),
      orders: [
        order,
        {
          ...order,
          id: "o2",
          reference: "ORD-2026-000002",
          status: "DELIVERED",
          total_price: 40_000,
          expected_at: "2026-01-01",
          delivered_at: "2026-02-09",
        },
      ],
    });
    expect(kpis.money.ordersActive).toBe(1);
    expect(kpis.money.ordersLate).toBe(1);
  });

  it("traite les besoins de stock bas au seuil de 1 m", () => {
    const over = aggregateDashboardKpis({ ...base(), fabrics: [{ ...fabric, quantity: 150 }] });
    expect(over.context.fabricsLow).toBe(0);
  });
});

describe("dayDateRange", () => {
  it("retourne une fenêtre de 30 jours jusque aujourd'hui", () => {
    const range = dayDateRange(30, "2026-02-10T12:00:00.000Z");
    expect(range.to).toBe("2026-02-10");
    expect(range.from).toBe("2026-01-12");
  });
});