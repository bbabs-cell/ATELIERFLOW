import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { createSubscriptionService } from "@/application/subscriptions/subscriptionService";
import type { SubscriptionServiceDeps } from "@/application/subscriptions/subscriptionService";
import type { SubscriptionMirror } from "@/domain/subscriptions/plans";
import { makeLocalCustomersRepository } from "@/repository/local/clients";
import { createIndexedDbCache } from "@/repository/local/indexeddb/cache";
import { makeLocalOrdersRepository } from "@/repository/local/orders";
import { makeLocalTeamRepository } from "@/repository/local/team";
import type { Customer } from "@/domain/clients/customer";
import type { OrderRecord } from "@/domain/orders/order";
import type { TeamMemberRecord } from "@/domain/team/teamMember";

let tenantSeq = 0;
const uniqueTenant = () =>
  `00000000-0000-4000-8000-00000000${(tenantSeq += 1).toString(16).padStart(8, "0")}`;
const TENANT = uniqueTenant();
const OWNER = "20000000-0000-4000-8000-000000000001";
const EMPLOYEE = "20000000-0000-4000-8000-000000000002";

const T0 = "2026-06-01";

function member(
  id: string,
  name: string,
  role: "OWNER" | "EMPLOYEE",
): TeamMemberRecord {
  return {
    id,
    tenant_id: TENANT,
    full_name: name,
    phone: null,
    role,
    status: "ACTIVE",
    invited_by: null,
    joined_at: `${T0}T08:00:00.000Z`,
    created_at: `${T0}T08:00:00.000Z`,
    updated_at: `${T0}T08:00:00.000Z`,
  };
}

function makeHarness(subscription?: SubscriptionMirror | null) {
  const cache = createIndexedDbCache(TENANT);
  const customers = makeLocalCustomersRepository(cache);
  const orders = makeLocalOrdersRepository(cache);
  const team = makeLocalTeamRepository(cache);
  const deps: SubscriptionServiceDeps = {
    profileId: OWNER,
    customers,
    orders,
    team,
    loadSubscription: async () => subscription ?? null,
  };
  return { cache, deps };
}

describe("createSubscriptionService", () => {
  it("présente le plan par défaut FREE / TRIAL sans abonnement stocké", async () => {
    const { deps } = makeHarness(null);
    const svc = createSubscriptionService(deps);
    const result = await svc.getOverview();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.overview.currentPlan.code).toBe("FREE");
    expect(result.overview.status).toBe("TRIAL");
    expect(result.overview.active).toBe(true);
    expect(result.overview.features.find((f) => f.feature === "whatsapp")?.enabled).toBe(false);
  });

  it("calcule les usages réels et les dépassements", async () => {
    const owner = member(OWNER, "Awa Diop", "OWNER");
    const mx = 40;
    const members: TeamMemberRecord[] = [owner];
    const customers: Customer[] = [];
    const orders: OrderRecord[] = [];
    for (let i = 0; i < mx; i += 1) {
      customers.push({
        id: `c${i}`,
        tenant_id: TENANT,
        full_name: `C${i}`,
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
      });
    }
    for (let i = 0; i < mx; i += 1) {
      orders.push({
        id: `o${i}`,
        tenant_id: TENANT,
        customer_id: `c${i}`,
        reference: `ORD-2026-${String(i + 1).padStart(6, "0")}`,
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
      });
    }
    const h = makeHarness({
      plan_code: "FREE",
      status: "TRIAL",
      started_at: `${T0}T08:00:00.000Z`,
      trial_ends_at: null,
      current_period_end: null,
      cancelled_at: null,
      price_monthly: 0,
      currency: "XOF",
    });
    for (const m of members) await h.deps.team.saveMember(m);
    for (const c of customers) await h.deps.customers.saveCustomer(c);
    for (const o of orders) await h.deps.orders.saveOrder(o);

    const svc = createSubscriptionService(h.deps);
    const result = await svc.getOverview();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.overview.usage.users).toBe(1);
    expect(result.overview.usage.customers).toBe(40);
    expect(result.overview.usage.ordersActive).toBe(40);
    const customersResource = result.overview.resources.find((r) => r.kind === "customers");
    expect(customersResource?.exceeded).toBe(true);
  });

  it("reflète un plan BASIC stocké", async () => {
    const owner = member(OWNER, "Awa Diop", "OWNER");
    const h = makeHarness({
      plan_code: "BASIC",
      status: "ACTIVE",
      started_at: "2026-05-01T00:00:00.000Z",
      trial_ends_at: null,
      current_period_end: "2026-07-01T00:00:00.000Z",
      cancelled_at: null,
      price_monthly: 5_000,
      currency: "XOF",
    });
    await h.deps.team.saveMember(owner);
    const svc = createSubscriptionService(h.deps);
    const result = await svc.getOverview();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.overview.currentPlan.name).toBe("Essentiel");
    expect(result.overview.currentPlan.priceMonthly).toBe(5_000);
    expect(result.overview.status).toBe("ACTIVE");
    expect(result.overview.nextBillingLabel).not.toBeNull();
    expect(result.overview.features.find((f) => f.feature === "stock")?.enabled).toBe(true);
    expect(result.overview.features.find((f) => f.feature === "audit")?.enabled).toBe(false);
  });

  it("refuse l'accès sans la permission subscriptions.view (EMPLOYEE)", async () => {
    const owner = member(EMPLOYEE, "Camille", "EMPLOYEE");
    const h = makeHarness();
    await h.deps.team.saveMember(owner);
    const svc = createSubscriptionService({ ...h.deps, profileId: EMPLOYEE });
    const result = await svc.getOverview();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("FORBIDDEN");
  });
});