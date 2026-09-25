import { describe, expect, it } from "vitest";
import {
  computeUsage,
  defaultSubscription,
  formatXof,
  getPlan,
  isFeatureEnabled,
  PLANS,
  resourcesFor,
  subscriptionActive,
} from "@/domain/subscriptions/plans";
import type { OrderRecord } from "@/domain/orders/order";
import type { Customer } from "@/domain/clients/customer";
import type { TeamMemberRecord } from "@/domain/team/teamMember";

const T0 = "2026-06-01";

const member = (id: string, status: TeamMemberRecord["status"]): TeamMemberRecord => ({
  id,
  tenant_id: "t1",
  full_name: "Membre",
  phone: null,
  role: "EMPLOYEE",
  status,
  invited_by: null,
  joined_at: status === "ACTIVE" ? `${T0}T08:00:00.000Z` : null,
  created_at: `${T0}T08:00:00.000Z`,
  updated_at: `${T0}T08:00:00.000Z`,
});

const customer = (id: string, over: Partial<Customer> = {}): Customer => ({
  id,
  tenant_id: "t1",
  full_name: "Client",
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
});

const order = (id: string, over: Partial<OrderRecord> = {}): OrderRecord => ({
  id,
  tenant_id: "t1",
  customer_id: "c1",
  reference: `ORD-2026-${id}`,
  status: "SEWING",
  priority: "NORMAL",
  total_price: 10_000,
  expected_at: null,
  delivered_at: null,
  employee_id: null,
  notes: null,
  created_by: null,
  created_at: `${T0}T08:00:00.000Z`,
  updated_at: `${T0}T08:00:00.000Z`,
  deleted_at: null,
  ...over,
});

describe("catalogue des plans (miroir 0005)", () => {
  it("reproduit les limites du seed", () => {
    expect(PLANS.FREE.limits).toMatchObject({
      users_max: 1,
      customers_max: 30,
      orders_max: 60,
      storage_mb: 200,
      whatsapp: false,
      stock: false,
      audit: false,
    });
    expect(PLANS.BASIC.price_monthly_cents).toBe(500_000);
    expect(PLANS.BASIC.limits.users_max).toBe(3);
    expect(PLANS.PRO.limits.users_max).toBe(15);
    expect(PLANS.PRO.limits.audit).toBe(true);
  });

  it("gère les drapeaux de fonctionnalité", () => {
    expect(isFeatureEnabled(getPlan("FREE"), "whatsapp")).toBe(false);
    expect(isFeatureEnabled(getPlan("BASIC"), "stock")).toBe(true);
    expect(isFeatureEnabled(getPlan("BASIC"), "audit")).toBe(false);
    expect(isFeatureEnabled(getPlan("PRO"), "audit")).toBe(true);
    expect(isFeatureEnabled(getPlan("PRO"), "team")).toBe(true);
  });
});

describe("computeUsage / resourcesFor", () => {
  it("compte membres actifs, clients actifs, commandes en cours", () => {
    const usage = computeUsage({
      members: [member("a", "ACTIVE"), member("b", "DEACTIVATED"), member("c", "INVITED")],
      customers: [customer("c1"), customer("c2", { status: "ARCHIVED" })],
      orders: [order("o1"), order("o2", { status: "DELIVERED" }), order("o3", { status: "CANCELLED" })],
    });
    expect(usage.users).toBe(1);
    expect(usage.customers).toBe(1);
    expect(usage.ordersActive).toBe(1);
  });

  it("signale le dépassement de limite et borne le pourcentage", () => {
    const usage = {
      users: 5,
      customers: 10,
      ordersActive: 30,
      storageMbUsed: 0,
    };
    const resources = resourcesFor(getPlan("FREE"), usage);
    const users = resources.find((r) => r.kind === "users");
    const orders = resources.find((r) => r.kind === "orders");
    expect(users?.exceeded).toBe(true);
    expect(orders?.percent).toBe(50);
  });
});

describe("status et format", () => {
  it("considère TRIAL/ACTIVE/PAST_DUE comme actif", () => {
    expect(subscriptionActive("ACTIVE")).toBe(true);
    expect(subscriptionActive("TRIAL")).toBe(true);
    expect(subscriptionActive("PAST_DUE")).toBe(true);
    expect(subscriptionActive("CANCELLED")).toBe(false);
    expect(subscriptionActive("EXPIRED")).toBe(false);
  });

  it("formate les prix en F CFA", () => {
    expect(formatXof(500_000)).toBe("5\u00A0000 F CFA");
    expect(formatXof(0)).toBe("0 F CFA");
  });

  it("fournit un abonnement par défaut FREE/TRIAL", () => {
    expect(defaultSubscription().plan_code).toBe("FREE");
    expect(defaultSubscription().status).toBe("TRIAL");
  });
});