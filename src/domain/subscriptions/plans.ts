import type {
  OrderRecord,
} from "@/domain/orders/order";
import type { Customer } from "@/domain/clients/customer";
import type { TeamMemberRecord } from "@/domain/team/teamMember";

/** Codes des plans, miroir du seed `0005_subscriptions.sql`. */
export const PLAN_CODES = ["FREE", "BASIC", "PRO"] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

export type PlanFeature =
  | "clients"
  | "commandes"
  | "mesures"
  | "payments"
  | "receipts"
  | "stock"
  | "whatsapp"
  | "appointments"
  | "team"
  | "reports"
  | "audit";

export interface PlanLimits {
  users_max: number;
  customers_max: number;
  orders_max: number;
  storage_mb: number;
  whatsapp: boolean;
  stock: boolean;
  audit: boolean;
}

export interface PlanDefinition {
  code: PlanCode;
  name: string;
  description: string;
  price_monthly_cents: number;
  currency: string;
  limits: PlanLimits;
  features: PlanFeature[];
  is_active: boolean;
  sort_order: number;
}

function plan(
  code: PlanCode,
  name: string,
  description: string,
  priceXof: number,
  limits: PlanLimits,
  features: PlanFeature[],
  sortOrder: number,
): PlanDefinition {
  return {
    code,
    name,
    description,
    price_monthly_cents: priceXof * 100,
    currency: "XOF",
    limits,
    features,
    is_active: true,
    sort_order: sortOrder,
  };
}

export const PLANS: Record<PlanCode, PlanDefinition> = {
  FREE: plan(
    "FREE",
    "Découverte",
    "Pour démarrer : quelques clients et commandes, 1 utilisateur.",
    0,
    {
      users_max: 1,
      customers_max: 30,
      orders_max: 60,
      storage_mb: 200,
      whatsapp: false,
      stock: false,
      audit: false,
    },
    ["clients", "commandes", "receipts"],
    1,
  ),
  BASIC: plan(
    "BASIC",
    "Essentiel",
    "Gestion complète pour un petit atelier, jusqu'à 3 utilisateurs.",
    5000,
    {
      users_max: 3,
      customers_max: 300,
      orders_max: 1000,
      storage_mb: 2000,
      whatsapp: true,
      stock: true,
      audit: false,
    },
    ["clients", "commandes", "mesures", "payments", "receipts", "stock", "whatsapp", "appointments"],
    2,
  ),
  PRO: plan(
    "PRO",
    "Atelier pro",
    "Usage intensif : équipe, stock, statistiques, audit élargi.",
    10000,
    {
      users_max: 15,
      customers_max: 5000,
      orders_max: 20000,
      storage_mb: 10000,
      whatsapp: true,
      stock: true,
      audit: true,
    },
    [
      "clients",
      "commandes",
      "mesures",
      "payments",
      "receipts",
      "stock",
      "whatsapp",
      "appointments",
      "team",
      "reports",
      "audit",
    ],
    3,
  ),
};

export function getPlan(code: PlanCode): PlanDefinition {
  return PLANS[code];
}

export function defaultPlanCode(): PlanCode {
  return "FREE";
}

export function isFeatureEnabled(plan: PlanDefinition, feature: PlanFeature): boolean {
  if (feature === "whatsapp") return plan.limits.whatsapp;
  if (feature === "stock") return plan.limits.stock;
  if (feature === "audit") return plan.limits.audit;
  return plan.features.includes(feature);
}

export type SubscriptionStatus =
  | "TRIAL"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELLED"
  | "EXPIRED";

export interface SubscriptionMirror {
  plan_code: PlanCode;
  status: SubscriptionStatus;
  started_at: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  cancelled_at: string | null;
  price_monthly_cents: number;
  currency: string;
}

export function defaultSubscription(): SubscriptionMirror {
  return {
    plan_code: "FREE",
    status: "TRIAL",
    started_at: null,
    trial_ends_at: null,
    current_period_end: null,
    cancelled_at: null,
    price_monthly_cents: 0,
    currency: "XOF",
  };
}

export function subscriptionActive(status: SubscriptionStatus): boolean {
  return status === "ACTIVE" || status === "TRIAL" || status === "PAST_DUE";
}

function groupThousands(value: number): string {
  const s = String(value);
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0");
}

export function formatXof(price_monthly_cents: number): string {
  const xof = Math.trunc(price_monthly_cents / 100);
  return `${groupThousands(xof)} F CFA`;
}

export interface SubscriptionUsage {
  users: number;
  customers: number;
  ordersActive: number;
  storageMbUsed: number;
}

export function computeUsage(input: {
  members: TeamMemberRecord[];
  customers: Customer[];
  orders: OrderRecord[];
}): SubscriptionUsage {
  const users = input.members.filter((m) => m.status === "ACTIVE").length;
  const customers = input.customers.filter(
    (c) => c.status === "ACTIVE" && c.deleted_at === null,
  ).length;
  const ordersActive = input.orders.filter(
    (o) => o.status !== "CANCELLED" && o.status !== "DELIVERED" && o.deleted_at === null,
  ).length;
  return { users, customers, ordersActive, storageMbUsed: 0 };
}

export type ResourceKind = "users" | "customers" | "orders" | "storage";

export interface ResourceState {
  kind: ResourceKind;
  used: number;
  limit: number;
  exceeded: boolean;
  percent: number;
}

export function resourcesFor(
  plan: PlanDefinition,
  usage: SubscriptionUsage,
): ResourceState[] {
  const entries: Array<{ kind: ResourceKind; used: number; limit: number }> = [
    { kind: "users", used: usage.users, limit: plan.limits.users_max },
    { kind: "customers", used: usage.customers, limit: plan.limits.customers_max },
    { kind: "orders", used: usage.ordersActive, limit: plan.limits.orders_max },
    { kind: "storage", used: usage.storageMbUsed, limit: plan.limits.storage_mb },
  ];
  return entries.map((e) => ({
    kind: e.kind,
    used: e.used,
    limit: e.limit,
    exceeded: e.limit > 0 && e.used > e.limit,
    percent: e.limit > 0 ? Math.min(100, Math.round((e.used / e.limit) * 100)) : 0,
  }));
}

export const RESOURCE_LABELS: Record<ResourceKind, { label: string; hint: string }> = {
  users: { label: "Utilisateurs", hint: "membres actifs de l'équipe" },
  customers: { label: "Clients", hint: "clients actifs" },
  orders: { label: "Commandes", hint: "commandes en cours" },
  storage: { label: "Stockage", hint: "photos et documents (R2, phase 05)" },
};