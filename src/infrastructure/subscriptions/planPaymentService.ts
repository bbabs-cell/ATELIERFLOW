import { isUuid, SIGNED_URL_TTL_SECONDS } from "@/domain/files/files";
import { checkProof, isPaymentMonths, planPaymentErrorCode, proofKey, type PaymentMonths } from "@/domain/subscriptions/planPayments";
import { FileServiceError, statusForCode } from "@/infrastructure/files/fileService";
import type { R2Storage } from "@/infrastructure/files/r2";

/**
 * Logique des routes /api/plan-payments, indépendante de Next et de
 * Supabase (injectés) pour être testée. Toujours exécutée pour une
 * session vérifiée ; la base revérifie tout (0024).
 */
export interface PlanPaymentsDb {
  submit(input: {
    id: string;
    planCode: string;
    months: PaymentMonths;
    methodId: string;
    senderName: string;
    senderPhone: string | null;
    reference: string | null;
    bucket: string;
    key: string;
    mime: string;
    size: number;
  }): Promise<Record<string, unknown>>;
  proof(id: string): Promise<{ tenantId: string; key: string }>;
}

export interface SubmitInput {
  planCode: unknown;
  months: unknown;
  methodId: unknown;
  senderName: unknown;
  senderPhone: unknown;
  reference: unknown;
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed.slice(0, max + 1);
}

function codeOf(error: unknown): string {
  if (error instanceof FileServiceError) return error.code;
  return planPaymentErrorCode(error instanceof Error ? error.message : undefined);
}

function statusOf(code: string): number {
  if (code.startsWith("PAYMENT_ALREADY")) return 409;
  return statusForCode(code);
}

export function createPlanPaymentService(deps: {
  tenantId: string;
  storage: R2Storage;
  db: PlanPaymentsDb;
  uuid?: () => string;
}) {
  const uuid = deps.uuid ?? (() => crypto.randomUUID());

  return {
    async submit(input: SubmitInput, bytes: Uint8Array): Promise<Record<string, unknown>> {
      const months = Number(input.months);
      const planCode = text(input.planCode, 40);
      const senderName = text(input.senderName, 80);
      if (!planCode || !isPaymentMonths(months) || !isUuid(input.methodId) || !senderName) {
        throw new FileServiceError("VALIDATION:body", 400);
      }
      const check = checkProof(bytes);
      if (!check.ok) throw new FileServiceError(check.code, check.code === "VALIDATION:size" ? 413 : 422);

      const id = uuid();
      const key = proofKey(deps.tenantId, id, check.mime);
      await deps.storage.put(key, bytes, check.mime);
      try {
        return await deps.db.submit({
          id,
          planCode,
          months,
          methodId: input.methodId,
          senderName,
          senderPhone: text(input.senderPhone, 30),
          reference: text(input.reference, 80),
          bucket: deps.storage.bucket,
          key,
          mime: check.mime,
          size: bytes.length,
        });
      } catch (error) {
        // Demande refusée : la preuve ne reste pas dans le stockage.
        await deps.storage.remove(key).catch(() => undefined);
        const code = codeOf(error);
        throw new FileServiceError(code, statusOf(code));
      }
    },

    async proofUrl(id: string): Promise<string> {
      if (!isUuid(id)) throw new FileServiceError("VALIDATION:body", 400);
      let proof: { tenantId: string; key: string };
      try {
        proof = await deps.db.proof(id);
      } catch (error) {
        const code = codeOf(error);
        throw new FileServiceError(code, statusOf(code));
      }
      // Défense en profondeur : la clé doit être celle de la demande, dans le dossier de son atelier.
      if (!isUuid(proof.tenantId) || !proof.key.startsWith(`tenants/${proof.tenantId}/plan-payments/${id}.`) || proof.key.includes("..")) {
        throw new FileServiceError("NOT_FOUND:plan_payment_requests", 404);
      }
      return deps.storage.signedGetUrl(proof.key, SIGNED_URL_TTL_SECONDS);
    },
  };
}
