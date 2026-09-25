import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { createDashboardService } from "@/application/dashboard/dashboardService";
import type { DashboardServiceDeps } from "@/application/dashboard/dashboardService";
import { makeLocalAppointmentsStores } from "@/repository/local/appointments";
import { makeLocalClientsStores } from "@/repository/local/clients";
import { createIndexedDbCache } from "@/repository/local/indexeddb/cache";
import { makeLocalInventoryStores } from "@/repository/local/inventory";
import { makeLocalOrderStores } from "@/repository/local/orders";
import { makeLocalPaymentsRepository } from "@/repository/local/payments";
import { makeLocalTeamRepository } from "@/repository/local/team";
import type { AppointmentRecord } from "@/domain/appointments/appointments";
import type { Customer } from "@/domain/clients/customer";
import type { FabricRecord } from "@/domain/inventory/fabrics";
import type { OrderRecord } from "@/domain/orders/order";
import type { PaymentRecord } from "@/domain/orders/payments";
import type { TeamMemberRecord } from "@/domain/team/teamMember";

let tenantSeq = 0;
const uniqueTenant = () =>
  `00000000-0000-4000-8000-00000000${(tenantSeq += 1).toString(16).padStart(8, "0")}`;
const TENANT = uniqueTenant();
const OWNER = "20000000-0000-4000-8000-000000000001";
const EMPLOYEE = "20000000-0000-4000-8000-000000000002";

const T0 = "2026-05-04";

function customer(
  id: string,
  name: string,
  over: Partial<Customer> = {},
): Customer {
  return {
    id,
    tenant_id: TENANT,
    full_name: name,
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
    ...over,
  };
}

function order(
  id: string,
  reference: string,
  customerId: string,
  over: Partial<OrderRecord> = {},
): OrderRecord {
  return {
    id,
    tenant_id: TENANT,
    customer_id: customerId,
    reference,
    status: "SEWING",
    priority: "NORMAL",
    total_price: 30_000,
    expected_at: null,
    delivered_at: null,
    employee_id: null,
    notes: null,
    created_by: null,
    created_at: `${T0}T08:00:00.000Z`,
    updated_at: `${T0}T08:00:00.000Z`,
    deleted_at: null,
    ...over,
  };
}

function payment(
  id: string,
  orderId: string,
  over: Partial<PaymentRecord> = {},
): PaymentRecord {
  return {
    id,
    tenant_id: TENANT,
    order_id: orderId,
    amount: 10_000,
    method: "CASH",
    status: "VALID",
    idempotency_key: `ik-${id}`,
    recorded_by: null,
    note: null,
    cancelled_by: null,
    cancelled_at: null,
    cancellation_reason: null,
    created_at: `${T0}T09:00:00.000Z`,
    updated_at: `${T0}T09:00:00.000Z`,
    ...over,
  };
}

interface Entry { name: string; body: TeamMemberRecord }

function member(
  id: string,
  name: string,
  role: "OWNER" | "EMPLOYEE" | "APPRENTICE",
): Entry {
  return {
    name,
    body: {
      id,
      tenant_id: TENANT,
      full_name: name,
      phone: "+221771112233",
      role,
      status: "ACTIVE",
      invited_by: null,
      joined_at: `${T0}T08:00:00.000Z`,
      created_at: `${T0}T08:00:00.000Z`,
      updated_at: `${T0}T08:00:00.000Z`,
    },
  };
}

function makeHarness() {
  const cache = createIndexedDbCache(TENANT);
  const clients = makeLocalClientsStores(cache);
  const orders = makeLocalOrderStores(cache);
  const inventory = makeLocalInventoryStores(cache);
  const appointments = makeLocalAppointmentsStores(cache);
  const deps: DashboardServiceDeps = {
    tenantId: TENANT,
    profileId: OWNER,
    customers: clients.customers,
    orders: orders.orders,
    payments: makeLocalPaymentsRepository(cache),
    fabrics: inventory.fabrics,
    movements: inventory.movements,
    appointments: appointments.appointments,
    team: makeLocalTeamRepository(cache),
    now: () => `${T0}T12:00:00.000Z`,
  };
  return { deps, store: { clients, orders, inventory, appointments, cache } };
}

describe("createDashboardService", () => {
  it("calcule les KPIs réels du workspace", async () => {
    const h = makeHarness();
    const awa = customer("c1", "Awa Diop");
    const moussa = customer("c2", "Moussa Ndiaye");
    const o1 = order("o1", "ORD-2026-000001", awa.id, { status: "SEWING", total_price: 30_000 });
    const o2 = order("o2", "ORD-2026-000002", moussa.id, {
      status: "DELIVERED",
      total_price: 40_000,
      expected_at: "2026-05-02",
      delivered_at: `${T0}T08:00:00.000Z`,
    });
    const fabric: FabricRecord = {
      id: "f1",
      tenant_id: TENANT,
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
    const appt: AppointmentRecord = {
      id: "a1",
      tenant_id: TENANT,
      customer_id: awa.id,
      order_id: o1.id,
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

    await h.store.clients.customers.saveCustomer(awa);
    await h.store.clients.customers.saveCustomer(moussa);
    await h.store.orders.orders.saveOrder(o1);
    await h.store.orders.orders.saveOrder(o2);
    await h.store.orders.orders.saveOrder(o1);
    await h.store.inventory.fabrics.saveFabric(fabric);
    await h.store.appointments.appointments.saveAppointment(appt);
    await h.store.cache.put("payments", "p1", payment("p1", o1.id));
    await h.store.cache.put("payments", "p2", payment("p2", o2.id, { amount: 40_000 }));
    await h.store.cache.put("payments", "p3", payment("p3", o1.id, { status: "CANCELLED", amount: 50_000 }));
    await h.store.cache.put("team_members", OWNER, member(OWNER, "Awa Diop", "OWNER").body);
    await h.store.cache.put("team_members", EMPLOYEE, member(EMPLOYEE, "Camille", "EMPLOYEE").body);

    const svc = createDashboardService(h.deps);
    const result = await svc.getKpis();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.kpis.money.revenuePeriod).toBe(50_000);
    expect(result.kpis.money.invoicedPeriod).toBe(70_000);
    expect(result.kpis.money.outstanding).toBe(20_000);
    expect(result.kpis.money.ordersActive).toBe(1);
    expect(result.kpis.money.ordersLate).toBe(0);
    expect(result.kpis.context.customersActive).toBe(2);
    expect(result.kpis.context.customersNewPeriod).toBe(2);
    expect(result.kpis.context.appointmentsToday).toBe(1);
    expect(result.kpis.context.fabricsLow).toBe(1);
    expect(result.kpis.context.teamActive).toBe(2);
    expect(result.kpis.paymentsByMethod).toHaveLength(1);
  });

  it("refuse les KPIs sans reports.read (APPRENTICE), mais autorise la recherche ciblée", async () => {
    const h = makeHarness();
    const awa = customer("c1", "Awa Diop");
    const o1 = order("o1", "ORD-2026-000001", awa.id);
    await h.store.clients.customers.saveCustomer(awa);
    await h.store.orders.orders.saveOrder(o1);
    const apprenticeId = "20000000-0000-4000-8000-000000000003";
    await h.store.cache.put("team_members", apprenticeId, member(apprenticeId, "Assane", "APPRENTICE").body);

    const svc = createDashboardService({ ...h.deps, profileId: apprenticeId });
    const kpiResult = await svc.getKpis();
    expect(kpiResult.ok).toBe(false);
    if (!kpiResult.ok) expect(kpiResult.reason).toBe("FORBIDDEN");

    const hits = await svc.search("diop");
    const kinds = hits.map((x) => x.kind);
    expect(kinds).toContain("customer");
    expect(kinds).not.toContain("member");

    const orderHits = await svc.search("000001");
    expect(orderHits.filter((x) => x.kind === "order")).toHaveLength(1);
  });

  it("recherche les membres seulement si team.read est accordé (OWNER)", async () => {
    const h = makeHarness();
    const awa = customer("c1", "Awa Diop");
    await h.store.clients.customers.saveCustomer(awa);
    await h.store.cache.put("team_members", OWNER, member(OWNER, "Awa Diop", "OWNER").body);

    const svc = createDashboardService(h.deps);
    const hits = await svc.search("awa");
    const kinds = hits.map((x) => x.kind);
    expect(kinds).toContain("customer");
    expect(kinds).toContain("member");
  });

  it("ne retourne rien pour une recherche trop courte", async () => {
    const h = makeHarness();
    const svc = createDashboardService(h.deps);
    expect(await svc.search("a")).toEqual([]);
  });
});