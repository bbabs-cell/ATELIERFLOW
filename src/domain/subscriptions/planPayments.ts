/**
 * Paiement d'un plan par transfert + preuve (migration 0024) — règles
 * pures partagées par l'interface et la route serveur. Le montant affiché
 * est indicatif : le serveur le recalcule (prix mensuel × mois).
 */
import { isUuid, sniffMime, type AllowedMime } from "@/domain/files/files";

export const PAYMENT_MONTHS = [1, 3, 6, 12] as const;
export type PaymentMonths = (typeof PAYMENT_MONTHS)[number];

/** Une preuve passe par la route serveur : même plafond que les fichiers. */
export const MAX_PROOF_BYTES = 4 * 1024 * 1024;

export type PlanPaymentStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export interface PaymentMethod {
  id: string;
  countryCode: string;
  countryName: string;
  label: string;
  accountNumber: string;
  accountName: string | null;
  instructions: string | null;
  isActive: boolean;
  sortOrder: number;
}

export interface PlanPaymentRequest {
  id: string;
  tenantId: string;
  tenantName: string | null;
  planCode: string | null;
  planName: string | null;
  months: number;
  amount: number;
  currency: string;
  countryName: string;
  methodLabel: string;
  methodAccount: string;
  senderName: string;
  senderPhone: string | null;
  transferReference: string | null;
  proofMime: string;
  status: PlanPaymentStatus;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export const PAYMENT_STATUS_LABELS: Record<PlanPaymentStatus, string> = {
  PENDING: "En vérification",
  APPROVED: "Validé",
  REJECTED: "Refusé",
  CANCELLED: "Annulé",
};

export function isPaymentMonths(value: unknown): value is PaymentMonths {
  return typeof value === "number" && (PAYMENT_MONTHS as readonly number[]).includes(value);
}

export function paymentAmount(priceMonthly: number, months: number): number {
  return priceMonthly * months;
}

export function monthsLabel(months: number): string {
  return months === 12 ? "12 mois (1 an)" : `${months} mois`;
}

/** Pays proposés : ceux qui ont au moins un moyen actif, dans l'ordre alphabétique. */
export function paymentCountries(methods: PaymentMethod[]): { code: string; name: string }[] {
  const seen = new Map<string, string>();
  for (const m of methods) if (m.isActive && !seen.has(m.countryCode)) seen.set(m.countryCode, m.countryName);
  return [...seen.entries()].map(([code, name]) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

export function methodsForCountry(methods: PaymentMethod[], countryCode: string): PaymentMethod[] {
  return methods
    .filter((m) => m.isActive && m.countryCode === countryCode)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "fr"));
}

const PROOF_EXT: Record<AllowedMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export type ProofCheck = { ok: true; mime: AllowedMime } | { ok: false; code: string };

/** Capture d'écran, photo ou PDF du reçu de transfert ; type lu dans les octets. */
export function checkProof(bytes: Uint8Array): ProofCheck {
  if (bytes.length === 0) return { ok: false, code: "VALIDATION:empty" };
  if (bytes.length > MAX_PROOF_BYTES) return { ok: false, code: "VALIDATION:size" };
  const mime = sniffMime(bytes);
  if (mime === null) return { ok: false, code: "VALIDATION:mime" };
  return { ok: true, mime };
}

/** Dossier de l'atelier, au nom de la demande (vérifié aussi par submit_plan_payment). */
export function proofKey(tenantId: string, requestId: string, mime: AllowedMime): string {
  if (!isUuid(tenantId) || !isUuid(requestId)) throw new Error("VALIDATION:key");
  return `tenants/${tenantId}/plan-payments/${requestId}.${PROOF_EXT[mime]}`;
}

const MESSAGES: Record<string, string> = {
  UNAUTHENTICATED: "Session expirée : reconnectez-vous.",
  OFFLINE: "Pas de connexion : l'envoi de la preuve nécessite Internet.",
  FILES_NOT_PROVISIONED: "L'envoi de fichiers n'est pas encore activé.",
  PAYMENT_ALREADY_PENDING: "Un paiement est déjà en cours de vérification pour cet atelier.",
  PAYMENT_ALREADY_REVIEWED: "Ce paiement a déjà été traité.",
  "VALIDATION:empty": "Fichier vide.",
  "VALIDATION:mime": "Preuve non acceptée : photo ou capture (JPEG, PNG, WebP) ou PDF.",
  "VALIDATION:size": "Preuve trop lourde (4 Mo maximum).",
  "VALIDATION:months": "Durée invalide.",
  "VALIDATION:sender_name": "Indiquez le nom de la personne qui a envoyé l'argent.",
  "VALIDATION:sender_phone": "Numéro d'envoi trop long.",
  "VALIDATION:reference": "Référence trop longue.",
  "VALIDATION:plan_free": "Ce plan est gratuit : aucun paiement n'est nécessaire.",
  "VALIDATION:note": "Indiquez le motif du refus (3 caractères minimum).",
  "VALIDATION:body": "Formulaire incomplet.",
  "VALIDATION:country_code": "Code pays invalide (2 lettres, ex. SN).",
  "VALIDATION:country_name": "Nom du pays requis.",
  "VALIDATION:label": "Nom du moyen de paiement requis (ex. Wave).",
  "VALIDATION:account_number": "Numéro ou compte requis.",
  "NOT_FOUND:payment_methods": "Ce moyen de paiement n'est plus disponible : choisissez-en un autre.",
  "NOT_FOUND:plans": "Ce plan n'est plus proposé.",
  "NOT_FOUND:plan_payment_requests": "Paiement introuvable.",
  "FORBIDDEN:tenant.settings": "Seul le propriétaire de l'atelier peut payer un plan.",
  "FORBIDDEN:platform": "Réservé à l'administration de la plateforme.",
};

export function planPaymentErrorMessage(code: string | null | undefined): string {
  if (code && MESSAGES[code]) return MESSAGES[code];
  if (code === "RATE_LIMITED:files") return "Trop d'envois en peu de temps. Réessayez plus tard.";
  return typeof navigator !== "undefined" && !navigator.onLine
    ? "Connexion Internet requise."
    : "L'opération a échoué. Réessayez.";
}

/** Code métier contenu dans un message d'erreur Postgres / PostgREST. */
export function planPaymentErrorCode(message: string | undefined): string {
  const match = /((?:FORBIDDEN|NOT_FOUND|VALIDATION):[\w.]+|PAYMENT_ALREADY_\w+)/.exec(message ?? "");
  return match ? match[1] : "DB_ERROR";
}

type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0));

export function parsePaymentMethod(row: Row): PaymentMethod {
  return {
    id: String(row.id),
    countryCode: String(row.country_code ?? ""),
    countryName: String(row.country_name ?? ""),
    label: String(row.label ?? ""),
    accountNumber: String(row.account_number ?? ""),
    accountName: str(row.account_name),
    instructions: str(row.instructions),
    isActive: row.is_active !== false,
    sortOrder: num(row.sort_order),
  };
}

export function parsePlanPayment(row: Row): PlanPaymentRequest {
  const status = String(row.status ?? "PENDING") as PlanPaymentStatus;
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id ?? ""),
    tenantName: str(row.tenant_name),
    planCode: str(row.plan_code),
    planName: str(row.plan_name),
    months: num(row.months),
    amount: num(row.amount),
    currency: String(row.currency ?? "XOF"),
    countryName: String(row.country_name ?? ""),
    methodLabel: String(row.method_label ?? ""),
    methodAccount: String(row.method_account ?? ""),
    senderName: String(row.sender_name ?? ""),
    senderPhone: str(row.sender_phone),
    transferReference: str(row.transfer_reference),
    proofMime: String(row.proof_mime ?? ""),
    status: status in PAYMENT_STATUS_LABELS ? status : "PENDING",
    reviewNote: str(row.review_note),
    reviewedAt: str(row.reviewed_at),
    createdAt: String(row.created_at ?? ""),
  };
}
