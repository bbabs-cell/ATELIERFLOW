import type { SupabaseClient } from "@supabase/supabase-js";
import { parseEntitlements, parseLimits, type Entitlements, type PlanLimits } from "@/domain/subscriptions/entitlements";

/**
 * Accès serveur aux abonnements (RPC de 0022). En ligne uniquement ; les
 * droits lus sont gardés en cache local pour prévenir hors ligne.
 * Chaque méthode lève une Error dont le message est le code SQL levé
 * (PLAN_LIMIT:…, FORBIDDEN:…, NOT_FOUND:…).
 */
export interface SubscriptionRemote {
  myEntitlements(): Promise<Entitlements>;
  /** null : annule la demande en cours. */
  requestPlanChange(planCode: string | null): Promise<Entitlements>;
}

export interface PlatformTenant {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  ownerEmail: string | null;
  entitlements: Entitlements;
}

export interface PlatformRemote {
  isAdmin(): Promise<boolean>;
  listTenants(): Promise<PlatformTenant[]>;
  setSubscription(input: { tenantId: string; planCode: string; months: number | null; trialDays?: number | null }): Promise<void>;
  updatePlan(input: { code: string; priceMonthly: number; limits: PlanLimits; trialDays: number }): Promise<void>;
}

type Row = Record<string, unknown>;

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

function entitlementsOrThrow(data: unknown): Entitlements {
  const parsed = parseEntitlements(data);
  if (!parsed) throw new Error("ENTITLEMENTS_INVALID");
  return parsed;
}

export function createSubscriptionRemote(client: SupabaseClient): SubscriptionRemote {
  return {
    async myEntitlements() {
      const { data, error } = await client.rpc("my_entitlements");
      fail(error);
      return entitlementsOrThrow(data);
    },
    async requestPlanChange(planCode) {
      const { data, error } = await client.rpc("request_plan_change", { p_plan_code: planCode });
      fail(error);
      return entitlementsOrThrow(data);
    },
  };
}

export function createPlatformRemote(client: SupabaseClient): PlatformRemote {
  return {
    async isAdmin() {
      const { data, error } = await client.rpc("is_saas_admin");
      if (error) return false;
      return data === true;
    },
    async listTenants() {
      const { data, error } = await client.rpc("admin_list_tenants");
      fail(error);
      const rows = Array.isArray(data) ? (data as Row[]) : [];
      return rows.flatMap((row) => {
        const ent = parseEntitlements({ ...(row.entitlements as Row), usage: row.usage, plans: [] });
        if (!ent) return [];
        return [
          {
            id: String(row.id),
            name: typeof row.name === "string" ? row.name : "—",
            status: String(row.status ?? ""),
            createdAt: String(row.created_at ?? ""),
            ownerEmail: typeof row.owner_email === "string" ? row.owner_email : null,
            entitlements: ent,
          },
        ];
      });
    },
    async setSubscription({ tenantId, planCode, months, trialDays = null }) {
      const { error } = await client.rpc("admin_set_subscription", {
        p_tenant: tenantId,
        p_plan_code: planCode,
        p_months: months,
        p_trial_days: trialDays,
      });
      fail(error);
    },
    async updatePlan({ code, priceMonthly, limits, trialDays }) {
      const { error } = await client.rpc("admin_update_plan", {
        p_code: code,
        p_price_monthly: priceMonthly,
        p_limits: parseLimits(limits),
        p_trial_days: trialDays,
      });
      fail(error);
    },
  };
}
