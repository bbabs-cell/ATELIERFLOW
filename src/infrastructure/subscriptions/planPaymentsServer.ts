import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveUserSession } from "@/infrastructure/files/serverContext";
import { createPlanPaymentService, type PlanPaymentsDb } from "./planPaymentService";

/** Accès base AU NOM de l'utilisateur : RPC de 0024 (RLS et contrôles côté base). */
function supabasePlanPaymentsDb(client: SupabaseClient): PlanPaymentsDb {
  return {
    async submit(input) {
      const { data, error } = await client.rpc("submit_plan_payment", {
        p_id: input.id,
        p_plan_code: input.planCode,
        p_months: input.months,
        p_method_id: input.methodId,
        p_sender_name: input.senderName,
        p_sender_phone: input.senderPhone,
        p_reference: input.reference,
        p_bucket: input.bucket,
        p_key: input.key,
        p_mime: input.mime,
        p_size: input.size,
      });
      if (error) throw new Error(error.message);
      return data as Record<string, unknown>;
    },
    async proof(id) {
      const { data, error } = await client.rpc("plan_payment_proof", { p_id: id });
      if (error) throw new Error(error.message);
      const row = (data ?? {}) as Record<string, unknown>;
      return { tenantId: String(row.tenant_id ?? ""), key: String(row.key ?? "") };
    },
  };
}

export async function planPaymentServiceFor(authorization: string | null) {
  const { tenantId, client, storage } = await resolveUserSession(authorization);
  return createPlanPaymentService({ tenantId, storage, db: supabasePlanPaymentsDb(client) });
}
