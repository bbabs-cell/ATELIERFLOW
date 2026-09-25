export const PAYMENT_MODES = [
  "CASH",
  "ORANGE_MONEY",
  "MOOV_MONEY",
  "WAVE",
  "TRANSFER",
  "OTHER",
] as const;

export type PaymentMethod = (typeof PAYMENT_MODES)[number];

export const PAYMENT_STATUSES = ["VALID", "CANCELLED"] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export interface PaymentRecord {
  id: string;
  tenant_id: string;
  order_id: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  idempotency_key: string;
  recorded_by: string | null;
  note: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface NewPaymentInput {
  orderId: string;
  amount: number;
  method: PaymentMethod;
  note?: string | null;
}

export type NewPaymentErrors = Partial<
  Record<"orderId" | "amount" | "method", string>
>;

export function validateNewPayment(
  input: NewPaymentInput,
): { ok: true; value: NewPaymentInput } | { ok: false; errors: NewPaymentErrors } {
  const errors: NewPaymentErrors = {};
  if (!input.orderId) {
    errors.orderId = "Commande requise.";
  }
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
    errors.amount = "Montant invalide (superieur a 0, en centimes).";
  }
  if (!PAYMENT_MODES.includes(input.method)) {
    errors.method = "Mode de paiement invalide.";
  }
  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, value: { ...input, note: input.note ?? null } };
}

export function isPaymentCancellable(payment: PaymentRecord): boolean {
  return payment.status === "VALID";
}

export function cancellationReasonValid(
  reason: string | null | undefined,
): boolean {
  return typeof reason === "string" && reason.trim().length > 0;
}

export interface PaymentBalance {
  total: number;
  totalPaid: number;
  remaining: number;
  surplus: number;
}

export function paymentBalance(
  orderTotal: number,
  payments: readonly PaymentRecord[],
): PaymentBalance {
  let totalPaid = 0;
  for (const payment of payments) {
    if (payment.status !== "VALID") continue;
    if (!Number.isSafeInteger(payment.amount) || payment.amount <= 0) continue;
    totalPaid += payment.amount;
    if (!Number.isSafeInteger(totalPaid)) {
      return { total: orderTotal, totalPaid: 0, remaining: orderTotal, surplus: 0 };
    }
  }
  const diff = orderTotal - totalPaid;
  return {
    total: orderTotal,
    totalPaid,
    remaining: diff >= 0 ? diff : 0,
    surplus: diff >= 0 ? 0 : -diff,
  };
}

export function formatPaymentMethodLabel(method: PaymentMethod): string {
  switch (method) {
    case "CASH":
      return "Espèces";
    case "ORANGE_MONEY":
      return "Orange Money";
    case "MOOV_MONEY":
      return "Moov Money";
    case "WAVE":
      return "Wave";
    case "TRANSFER":
      return "Virement";
    case "OTHER":
      return "Autre";
  }
}