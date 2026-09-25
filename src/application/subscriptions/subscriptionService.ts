import {
  computeUsage,
  defaultSubscription,
  getPlan,
  isFeatureEnabled,
  resourcesFor,
  subscriptionActive,
} from "@/domain/subscriptions/plans";
import type {
  PlanDefinition,
  PlanFeature,
  PlanLimits,
  ResourceState,
  SubscriptionMirror,
} from "@/domain/subscriptions/plans";
import type {
  OrdersRepository,
} from "@/repository/ports/orders";
import type { CustomersRepository } from "@/repository/ports/clients";
import type { TeamMembersRepository } from "@/repository/ports/team";
import { can } from "@/domain/team/roles";
import type { PermissionCode, TenantRoleCode } from "@/domain/team/roles";

export interface SubscriptionServiceDeps {
  profileId: string;
  customers: CustomersRepository;
  orders: OrdersRepository;
  team: TeamMembersRepository;
  loadSubscription?: () => Promise<SubscriptionMirror | null>;
}

export interface PlanStatus {
  code: string;
  name: string;
  description: string;
  priceMonthlyCents: number;
  currency: string;
  limits: PlanLimits;
}

export interface FeatureStatus {
  feature: PlanFeature;
  label: string;
  enabled: boolean;
}

export interface SubscriptionOverview {
  currentPlan: PlanStatus;
  status: string;
  active: boolean;
  startedAt: string | null;
  trialEndsAt: string | null;
  periodEnd: string | null;
  nextBillingLabel: string | null;
  usage: {
    users: number;
    customers: number;
    ordersActive: number;
  };
  resources: ResourceState[];
  features: FeatureStatus[];
}

export const FEATURE_LABELS: Record<PlanFeature, string> = {
  clients: "Clients",
  commandes: "Commandes",
  mesures: "Mesures",
  payments: "Paiements",
  receipts: "Reçus",
  stock: "Stock & tissus",
  whatsapp: "Rappels WhatsApp",
  appointments: "Rendez-vous",
  team: "Équipe & rôles",
  reports: "Statistiques",
  audit: "Journal d'audit",
};

export type SubscriptionResult =
  | { ok: true; overview: SubscriptionOverview }
  | { ok: false; reason: string };

export interface SubscriptionService {
  getOverview(): Promise<SubscriptionResult>;
}

export function createSubscriptionService(deps: SubscriptionServiceDeps): SubscriptionService {
  async function getActorRole(): Promise<{ role: TenantRoleCode }> {
    const me = await deps.team.getMember(deps.profileId);
    const role: TenantRoleCode = me === null ? "OWNER" : me.role;
    return { role };
  }

  return {
    async getOverview() {
      const { role } = await getActorRole();
      if (!can(role, "subscriptions.view" as PermissionCode)) {
        return { ok: false, reason: "FORBIDDEN" };
      }
      const mirror = (await deps.loadSubscription?.()) ?? null;
      const subscription: SubscriptionMirror = mirror ?? defaultSubscription();
      const plan: PlanDefinition = getPlan(subscription.plan_code);

      const [members, customers, orders] = await Promise.all([
        deps.team.listAll(),
        deps.customers.list("", false),
        deps.orders.listOrders({ includeArchive: false }),
      ]);
      const usage = computeUsage({ members, customers, orders });
      const resources = resourcesFor(plan, usage);

      const features: FeatureStatus[] = (
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
        ] as PlanFeature[]
      ).map((feature) => ({
        feature,
        label: FEATURE_LABELS[feature],
        enabled: isFeatureEnabled(plan, feature),
      }));

      const active = subscriptionActive(subscription.status);
      const periodEnd = subscription.current_period_end;
      const nextBillingLabel = periodEnd
        ? new Date(periodEnd).toLocaleDateString("fr-FR")
        : subscription.status === "TRIAL"
          ? new Date(subscription.trial_ends_at ?? new Date().toISOString()).toLocaleDateString("fr-FR")
          : null;

      return {
        ok: true,
        overview: {
          currentPlan: {
            code: plan.code,
            name: plan.name,
            description: plan.description,
            priceMonthlyCents: plan.price_monthly_cents,
            currency: plan.currency,
            limits: plan.limits,
          },
          status: subscription.status,
          active,
          startedAt: subscription.started_at,
          trialEndsAt: subscription.trial_ends_at,
          periodEnd,
          nextBillingLabel,
          usage: {
            users: usage.users,
            customers: usage.customers,
            ordersActive: usage.ordersActive,
          },
          resources,
          features,
        },
      };
    },
  };
}