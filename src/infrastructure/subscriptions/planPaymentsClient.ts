import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parsePaymentMethod,
  parsePlanPayment,
  planPaymentErrorCode,
  type PaymentMethod,
  type PaymentMonths,
  type PlanPaymentRequest,
  type PlanPaymentStatus,
} from "@/domain/subscriptions/planPayments";
import { getAccessToken } from "@/infrastructure/supabase/browserClient";

/**
 * Accès navigateur aux paiements de plan (0024). Lecture par RLS, actions
 * par RPC ; la preuve passe par /api/plan-payments (aucune clé R2 ici).
 * Les erreurs portent le code métier (PAYMENT_ALREADY_PENDING…).
 */
export class PlanPaymentError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

type Row = Record<string, unknown>;

function fail(error: { message: string } | null): void {
  if (error) throw new PlanPaymentError(planPaymentErrorCode(error.message));
}

async function authHeaders(): Promise<HeadersInit> {
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new PlanPaymentError("OFFLINE");
  const token = await getAccessToken();
  if (!token) throw new PlanPaymentError("UNAUTHENTICATED");
  return { Authorization: `Bearer ${token}` };
}

async function readError(response: Response): Promise<PlanPaymentError> {
  try {
    const body = (await response.json()) as { error?: { code?: string } };
    return new PlanPaymentError(body.error?.code ?? `HTTP_${response.status}`);
  } catch {
    return new PlanPaymentError(`HTTP_${response.status}`);
  }
}

export interface SubmitPlanPayment {
  planCode: string;
  months: PaymentMonths;
  methodId: string;
  senderName: string;
  senderPhone: string;
  reference: string;
  file: Blob;
  fileName: string;
}

export function createPlanPaymentsClient(client: SupabaseClient) {
  return {
    /** Moyens visibles : actifs pour un atelier, tous pour la plateforme (RLS). */
    async listMethods(): Promise<PaymentMethod[]> {
      const { data, error } = await client
        .from("payment_methods")
        .select("*")
        .order("country_name", { ascending: true })
        .order("sort_order", { ascending: true });
      fail(error);
      return ((data ?? []) as Row[]).map(parsePaymentMethod);
    },

    /** Paiements de l'atelier connecté, du plus récent au plus ancien. */
    async myPayments(): Promise<PlanPaymentRequest[]> {
      const { data, error } = await client
        .from("plan_payment_requests")
        .select("*, plans(code, name)")
        .order("created_at", { ascending: false })
        .limit(10);
      fail(error);
      return ((data ?? []) as Row[]).map((row) => {
        const plan = (row.plans ?? {}) as Row;
        return parsePlanPayment({ ...row, plan_code: plan.code, plan_name: plan.name });
      });
    },

    async submit(input: SubmitPlanPayment): Promise<void> {
      const form = new FormData();
      form.set("planCode", input.planCode);
      form.set("months", String(input.months));
      form.set("methodId", input.methodId);
      form.set("senderName", input.senderName);
      form.set("senderPhone", input.senderPhone);
      form.set("reference", input.reference);
      form.set("file", input.file, input.fileName);
      const response = await fetch("/api/plan-payments", { method: "POST", headers: await authHeaders(), body: form });
      if (!response.ok) throw await readError(response);
    },

    async cancel(id: string): Promise<void> {
      const { error } = await client.rpc("cancel_plan_payment", { p_id: id });
      fail(error);
    },

    async proofUrl(id: string): Promise<string> {
      const response = await fetch(`/api/plan-payments/${id}/proof`, { headers: await authHeaders(), cache: "no-store" });
      if (!response.ok) throw await readError(response);
      return ((await response.json()) as { url: string }).url;
    },

    // --- Plateforme -----------------------------------------------------
    async adminList(status: PlanPaymentStatus | null): Promise<PlanPaymentRequest[]> {
      const { data, error } = await client.rpc("admin_list_plan_payments", { p_status: status });
      fail(error);
      return (Array.isArray(data) ? (data as Row[]) : []).map(parsePlanPayment);
    },

    async review(id: string, approve: boolean, note: string): Promise<void> {
      const { error } = await client.rpc("admin_review_plan_payment", {
        p_id: id,
        p_approve: approve,
        p_note: note.trim() || null,
      });
      fail(error);
    },

    async saveMethod(input: Omit<PaymentMethod, "id"> & { id: string | null }): Promise<void> {
      const { error } = await client.rpc("admin_upsert_payment_method", {
        p_id: input.id,
        p_country_code: input.countryCode,
        p_country_name: input.countryName,
        p_label: input.label,
        p_account_number: input.accountNumber,
        p_account_name: input.accountName ?? "",
        p_instructions: input.instructions ?? "",
        p_is_active: input.isActive,
        p_sort_order: input.sortOrder,
      });
      fail(error);
    },
  };
}

export type PlanPaymentsClient = ReturnType<typeof createPlanPaymentsClient>;
