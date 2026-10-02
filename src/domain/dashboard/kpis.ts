import { sumAmounts } from "@/domain/money";
import type { AppointmentRecord } from "@/domain/appointments/appointments";
import type { AppointmentType } from "@/domain/appointments/appointments";
import type { Customer } from "@/domain/clients/customer";
import type { FabricRecord } from "@/domain/inventory/fabrics";
import type { StockMovementRecord } from "@/domain/inventory/stock";
import type { OrderStatus, OrderRecord } from "@/domain/orders/order";
import type { PaymentRecord } from "@/domain/orders/payments";
import type { TeamMemberRecord } from "@/domain/team/teamMember";

export const LOW_STOCK_THRESHOLD_CENTI = 100;

export interface DateRange {
  from: string;
  to: string;
}

export interface RevenuePoint {
  label: string;
  amount: number;
}

export interface DashboardMoneyKpis {
  revenuePeriod: number;
  invoicedPeriod: number;
  outstanding: number;
  ordersActive: number;
  ordersReadyPickup: number;
  ordersLate: number;
}

export interface DashboardContextKpis {
  customersActive: number;
  customersNewPeriod: number;
  appointmentsToday: number;
  fabricsLow: number;
  stockUnitsCenti: number;
  stockOutPeriodCenti: number;
  teamActive: number;
}

export interface OrderStatusBucket {
  status: OrderStatus;
  count: number;
}

export interface AppointmentTypeBucket {
  type: AppointmentType;
  count: number;
}

export interface PaymentMethodBucket {
  method: string;
  amount: number;
  count: number;
}

export interface DashboardKpis {
  money: DashboardMoneyKpis;
  context: DashboardContextKpis;
  revenue: RevenuePoint[];
  ordersByStatus: OrderStatusBucket[];
  appointmentsByType: AppointmentTypeBucket[];
  paymentsByMethod: PaymentMethodBucket[];
}

export interface DashboardInput {
  customers: Customer[];
  orders: OrderRecord[];
  payments: PaymentRecord[];
  fabrics: FabricRecord[];
  movements: StockMovementRecord[];
  appointments: AppointmentRecord[];
  team: TeamMemberRecord[];
  range: DateRange;
  today: string;
}

function startOfDay(iso: string): number {
  return new Date(`${iso.slice(0, 10)}T00:00:00.000Z`).getTime();
}

function endOfDay(iso: string): number {
  return startOfDay(iso) + 86_400_000 - 1;
}

export function isUnpaidOrder(order: OrderRecord): boolean {
  return order.status !== "CANCELLED" && order.status !== "DELIVERED";
}

export function isValidPayment(payment: PaymentRecord): boolean {
  return payment.status === "VALID";
}

export function buildRevenuePoints(
  payments: PaymentRecord[],
  range: DateRange,
  buckets = 7,
): RevenuePoint[] {
  const from = startOfDay(range.from);
  const to = endOfDay(range.to);
  const span = Math.max(to - from, 1);
  const size = span / buckets;
  const points: RevenuePoint[] = [];
  for (let i = 0; i < buckets; i += 1) {
    const start = from + i * size;
    const end = i === buckets - 1 ? to : start + size - 1;
    let amount = 0;
    for (const payment of payments) {
      if (!isValidPayment(payment)) continue;
      const at = new Date(payment.created_at).getTime();
      if (at >= start && at <= end) amount += payment.amount;
    }
    const label = new Date(start + size / 2).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
    });
    points.push({ label, amount });
  }
  return points;
}

export function aggregateDashboardKpis(input: DashboardInput): DashboardKpis {
  const fromMs = startOfDay(input.range.from);
  const toMs = endOfDay(input.range.to);
  const validPayments = input.payments.filter(isValidPayment);
  const paidByOrder = new Map<string, number>();
  for (const payment of validPayments) {
    paidByOrder.set(
      payment.order_id,
      (paidByOrder.get(payment.order_id) ?? 0) + payment.amount,
    );
  }

  let invoicedPeriod = 0;
  let outstanding = 0;
  let ordersActive = 0;
  let ordersReadyPickup = 0;
  let ordersLate = 0;
  const ordersByStatusCount = new Map<OrderStatus, number>();

  for (const order of input.orders) {
    if (order.status === "CANCELLED") continue;
    const created = new Date(order.created_at).getTime();
    if (created >= fromMs && created <= toMs) {
      invoicedPeriod += order.total_price;
    }
    const total = order.total_price;
    const paid = paidByOrder.get(order.id) ?? 0;
    const balance = total - paid;
    if (balance > 0) outstanding += balance;
    if (isUnpaidOrder(order)) {
      ordersActive += 1;
      if (order.status === "READY_FOR_PICKUP") ordersReadyPickup += 1;
      if (
        order.expected_at !== null &&
        order.expected_at <= input.today.slice(0, 10) &&
        order.status !== "DELIVERED"
      ) {
        ordersLate += 1;
      }
    }
    ordersByStatusCount.set(
      order.status,
      (ordersByStatusCount.get(order.status) ?? 0) + 1,
    );
  }

  const revenuePeriod = sumAmounts(
    validPayments
      .filter((p) => {
        const at = new Date(p.created_at).getTime();
        return at >= fromMs && at <= toMs;
      })
      .map((p) => p.amount),
  ) ?? 0;

  const appointmentsToday = input.appointments.filter(
    (a) =>
      (a.status === "SCHEDULED" || a.status === "CONFIRMED") &&
      a.starts_at >= input.today.slice(0, 10) + "T00:00:00.000Z" &&
      a.starts_at < input.today.slice(0, 10) + "T23:59:59.999Z",
  ).length;

  const activeCustomers = input.customers.filter(
    (c) => c.status === "ACTIVE" && c.deleted_at === null,
  );
  const customersNewPeriod = activeCustomers.filter((c) => {
    const at = new Date(c.created_at).getTime();
    return at >= fromMs && at <= toMs;
  }).length;

  const lowFabrics = input.fabrics.filter(
    (f) => f.status === "ACTIVE" && f.quantity <= LOW_STOCK_THRESHOLD_CENTI,
  );
  const stockUnitsCenti = input.fabrics
    .filter((f) => f.status === "ACTIVE")
    .reduce((acc, f) => acc + f.quantity, 0);
  const stockOutPeriodCenti = input.movements
    .filter((m) => m.type === "OUT")
    .reduce((acc, m) => acc + m.quantity, 0);

  const teamActive = input.team.filter(
    (m) => m.status === "ACTIVE",
  ).length;

  const appointmentsByTypeCount = new Map<AppointmentType, number>();
  for (const a of input.appointments) {
    appointmentsByTypeCount.set(
      a.type,
      (appointmentsByTypeCount.get(a.type) ?? 0) + 1,
    );
  }

  const paymentsByMethodTotals = new Map<string, number>();
  const paymentsByMethodCount = new Map<string, number>();
  for (const p of validPayments) {
    paymentsByMethodTotals.set(
      p.method,
      (paymentsByMethodTotals.get(p.method) ?? 0) + p.amount,
    );
    paymentsByMethodCount.set(
      p.method,
      (paymentsByMethodCount.get(p.method) ?? 0) + 1,
    );
  }

  return {
    money: {
      revenuePeriod,
      invoicedPeriod,
      outstanding,
      ordersActive,
      ordersReadyPickup,
      ordersLate,
    },
    context: {
      customersActive: activeCustomers.length,
      customersNewPeriod,
      appointmentsToday,
      fabricsLow: lowFabrics.length,
      stockUnitsCenti,
      stockOutPeriodCenti,
      teamActive,
    },
    revenue: buildRevenuePoints(input.payments, input.range),
    ordersByStatus: [...ordersByStatusCount.entries()]
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count),
    appointmentsByType: [...appointmentsByTypeCount.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count),
    paymentsByMethod: [...paymentsByMethodTotals.entries()]
      .map(([method, amount]) => ({
        method,
        amount,
        count: paymentsByMethodCount.get(method) ?? 0,
      }))
      .sort((a, b) => b.amount - a.amount),
  };
}

export function defaultDateRange(now: string, periodMonths = 1): DateRange {
  const start = new Date(now);
  start.setUTCMonth(start.getUTCMonth() - periodMonths);
  const from = start.toISOString().slice(0, 10);
  const to = now.slice(0, 10);
  return { from, to };
}

export function dayDateRange(days: number, now: string): DateRange {
  const to = now.slice(0, 10);
  const start = new Date(`${to}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { from: start.toISOString().slice(0, 10), to };
}