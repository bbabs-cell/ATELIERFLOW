import type { PaymentMethod } from "@/domain/orders/payments";

export const REC_REFERENCE_RE = /^REC-\d{4}-\d{6}$/;

export interface ReceiptState {
  total: number;
  totalPaid: number;
  remaining: number;
  surplus: number;
}

export interface ReceiptRecord {
  id: string;
  tenant_id: string;
  order_id: string;
  payment_id: string | null;
  reference: string;
  amount: number;
  method: PaymentMethod | null;
  state: ReceiptState;
  is_correction: boolean;
  issued_by: string | null;
  pdf_key: string | null;
  issued_at: string;
  created_at: string;
}

export interface ReceiptDraft {
  tenant_id: string;
  order_id: string;
  payment_id: string | null;
  amount: number;
  method: PaymentMethod | null;
  state: ReceiptState;
  is_correction: boolean;
  issued_by: string | null;
}

export function isReceiptReference(value: string): boolean {
  return REC_REFERENCE_RE.test(value);
}

export function newReceiptReference(year: number, sequence: number): string {
  if (!Number.isSafeInteger(year) || year < 2000 || year > 9999) {
    throw new Error("RECEIPT_YEAR_INVALID");
  }
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new Error("RECEIPT_SEQUENCE_INVALID");
  }
  return `REC-${year}-${String(sequence).padStart(6, "0")}`;
}

export function extractReceiptSequence(reference: string): number | null {
  if (!isReceiptReference(reference)) return null;
  return Number(reference.slice(reference.length - 6));
}

export function nextReceiptSequence(
  year: number,
  references: readonly string[],
): number {
  const prefix = `REC-${year}-`;
  const sequences = references
    .filter((ref) => typeof ref === "string" && ref.startsWith(prefix))
    .map((ref) => extractReceiptSequence(ref))
    .filter((n): n is number => n !== null);
  return sequences.length === 0 ? 1 : Math.max(...sequences) + 1;
}

/**
 * La référence du paiement est emprisonnée dans le reçu : un reçu est émis pour
 * exactement un paiement. Deux reçus (initial + contre-avoir) sont possibles,
 * jamais deux reçus de même nature pour le même paiement.
 */
export function receiptKind(isCorrection: boolean): "RECEIPT" | "CREDIT" {
  return isCorrection ? "CREDIT" : "RECEIPT";
}

export function buildReceipt(
  draft: ReceiptDraft & {
    id: string;
    reference: string;
    issued_at: string;
  },
): ReceiptRecord {
  if (!isReceiptReference(draft.reference)) {
    throw new Error("RECEIPT_REFERENCE_INVALID");
  }
  if (!Number.isSafeInteger(draft.amount) || draft.amount < 0) {
    throw new Error("RECEIPT_AMOUNT_INVALID");
  }
  return {
    id: draft.id,
    tenant_id: draft.tenant_id,
    order_id: draft.order_id,
    payment_id: draft.payment_id,
    reference: draft.reference,
    amount: draft.amount,
    method: draft.method,
    state: { ...draft.state },
    is_correction: draft.is_correction,
    issued_by: draft.issued_by,
    pdf_key: null,
    issued_at: draft.issued_at,
    created_at: draft.issued_at,
  };
}