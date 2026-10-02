import { formatFcfa } from "@/domain/money";
import { fcfaInWords } from "@/domain/moneyWords";
import { formatPaymentMethodLabel, type PaymentRecord } from "./payments";
import type { OrderItemRecord, OrderRecord } from "./order";
import { receiptKind, type ReceiptRecord, type ReceiptState } from "./receipts";

/**
 * Document du reçu (prompt 16) — modèle unique, pur, partagé par l'aperçu
 * à l'écran, l'impression et le PDF : les trois affichent exactement les
 * mêmes valeurs.
 *
 * Toutes les sommes viennent du reçu émis (montant et état figés à
 * l'émission, puis confirmés par le serveur) — jamais recalculées depuis
 * les paiements actuels : un reçu reflète les données validées au moment
 * où il a été émis.
 */

export interface AtelierIdentity {
  name: string;
  phone: string | null;
  address: string | null;
  /** Mention libre en pied de reçu (horaires, conditions de retrait…). */
  footer: string | null;
}

export interface ReceiptLine {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface ReceiptDocument {
  kind: "RECEIPT" | "CREDIT";
  title: string;
  reference: string;
  /** Référence locale pas encore confirmée par le serveur (hors ligne). */
  provisional: boolean;
  issuedAt: string;
  issuedAtLabel: string;
  atelier: AtelierIdentity;
  customer: { name: string; phone: string | null };
  order: { reference: string; lines: ReceiptLine[] };
  payment: {
    amount: number;
    amountLabel: string;
    amountInWords: string;
    method: string | null;
    note: string | null;
    /** Contre-avoir : raison de l'annulation du paiement. */
    cancellationReason: string | null;
  };
  state: ReceiptState;
  balance: { label: string; amount: number; tone: "remaining" | "surplus" | "settled" };
}

export interface ReceiptDocumentInput {
  receipt: ReceiptRecord;
  order: Pick<OrderRecord, "reference">;
  items: readonly OrderItemRecord[];
  customer: { full_name: string; phone: string | null } | null;
  payment: Pick<PaymentRecord, "note" | "cancellation_reason"> | null;
  atelier: AtelierIdentity;
  provisional: boolean;
  /** Fuseau d'affichage de la date (celui de l'appareil). */
  timeZone?: string;
}

export function formatReceiptDate(iso: string, timeZone?: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const day = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone,
  }).format(date);
  const time = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(date);
  return `${day} à ${time}`;
}

export function receiptBalance(state: ReceiptState): ReceiptDocument["balance"] {
  if (state.surplus > 0) return { label: "Surplus à rendre", amount: state.surplus, tone: "surplus" };
  if (state.remaining > 0) return { label: "Reste à payer", amount: state.remaining, tone: "remaining" };
  return { label: "Commande soldée", amount: 0, tone: "settled" };
}

export function buildReceiptDocument(input: ReceiptDocumentInput): ReceiptDocument {
  const { receipt } = input;
  const kind = receiptKind(receipt.is_correction);
  const lines = [...input.items]
    .filter((item) => item.deleted_at === null)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      total: item.quantity * item.unit_price,
    }));
  return {
    kind,
    title: kind === "CREDIT" ? "Contre-avoir" : "Reçu de paiement",
    reference: receipt.reference,
    provisional: input.provisional,
    issuedAt: receipt.issued_at,
    issuedAtLabel: formatReceiptDate(receipt.issued_at, input.timeZone),
    atelier: input.atelier,
    customer: {
      name: input.customer?.full_name ?? "Client",
      phone: input.customer?.phone ?? null,
    },
    order: { reference: input.order.reference, lines },
    payment: {
      amount: receipt.amount,
      amountLabel: formatFcfa(receipt.amount),
      amountInWords: fcfaInWords(receipt.amount),
      method: receipt.method ? formatPaymentMethodLabel(receipt.method) : null,
      note: input.payment?.note ?? null,
      cancellationReason: kind === "CREDIT" ? (input.payment?.cancellation_reason ?? null) : null,
    },
    state: { ...receipt.state },
    balance: receiptBalance(receipt.state),
  };
}

/** « Recu-REC-2026-000001.pdf » — ASCII, sans espace (partage, WhatsApp). */
export function receiptFileName(doc: Pick<ReceiptDocument, "kind" | "reference">): string {
  return `${doc.kind === "CREDIT" ? "Contre-avoir" : "Recu"}-${doc.reference}.pdf`;
}

/** Message d'accompagnement du reçu partagé au client. */
export function receiptShareMessage(doc: ReceiptDocument): string {
  const hello = doc.customer.name !== "Client" ? `Bonjour ${doc.customer.name},` : "Bonjour,";
  const what =
    doc.kind === "CREDIT"
      ? `voici le contre-avoir ${doc.reference} (paiement de ${doc.payment.amountLabel} annulé)`
      : `voici votre reçu ${doc.reference} pour le paiement de ${doc.payment.amountLabel}`;
  const balance =
    doc.balance.tone === "settled"
      ? "Votre commande est entièrement réglée."
      : `${doc.balance.label} : ${formatFcfa(doc.balance.amount)}.`;
  return [
    `${hello} ${what} — commande ${doc.order.reference}, ${doc.issuedAtLabel}.`,
    `Total ${formatFcfa(doc.state.total)}, déjà payé ${formatFcfa(doc.state.totalPaid)}. ${balance}`,
    `Merci de votre confiance — ${doc.atelier.name}`,
  ].join("\n");
}

/**
 * Lien WhatsApp vers le client : numéro international (« +221… » ou
 * « 00221… ») → conversation directe ; sinon partage libre (l'utilisateur
 * choisit le contact).
 */
export function receiptWhatsappUrl(phone: string | null, message: string): string {
  const text = encodeURIComponent(message);
  const compact = (phone ?? "").replace(/[\s.\-()]/g, "");
  const international = compact.startsWith("+") ? compact.slice(1) : compact.startsWith("00") ? compact.slice(2) : null;
  if (international && /^\d{8,15}$/.test(international)) {
    return `https://wa.me/${international}?text=${text}`;
  }
  return `https://wa.me/?text=${text}`;
}
