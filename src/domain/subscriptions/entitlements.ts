/**
 * Droits d'un atelier selon son abonnement (étape 21).
 *
 * La source de vérité est le serveur (`my_entitlements`, migration 0022) :
 * prix, limites, durée d'essai et délai de grâce vivent dans `public.plans`
 * et se modifient sans toucher au code. Ce module ne fait que LIRE ces
 * valeurs et les interpréter pour l'interface (prévenir avant de créer).
 * Le serveur reste l'arbitre : il refuse toute création au-delà du plan.
 */
import { formatFcfa, groupThousands } from "@/domain/money";

export type EntitlementStatus = "TRIAL" | "ACTIVE" | "GRACE" | "EXPIRED" | "NONE";
export type LimitKind = "users" | "customers" | "orders" | "storage";
export type FeatureFlag = "whatsapp" | "stock" | "audit";

/** Limite numérique : null = illimitée. */
export interface PlanLimits {
  users_max: number | null;
  customers_max: number | null;
  orders_max: number | null;
  storage_mb: number | null;
  whatsapp: boolean;
  stock: boolean;
  audit: boolean;
}

export interface PlanInfo {
  code: string;
  name: string;
  description: string | null;
  priceMonthly: number;
  currency: string;
  limits: PlanLimits;
  features: string[];
  trialDays: number;
  isDefault: boolean;
}

export interface Usage {
  users: number;
  pendingInvitations: number;
  customers: number;
  orders: number;
  storageBytes: number;
}

export interface Entitlements {
  planCode: string;
  planName: string;
  limits: PlanLimits;
  status: EntitlementStatus;
  subscribedPlanCode: string | null;
  trialEndsAt: string | null;
  periodEnd: string | null;
  graceEndsAt: string | null;
  priceMonthly: number;
  currency: string;
  requestedPlanCode: string | null;
  requestedAt: string | null;
  usage: Usage;
  plans: PlanInfo[];
}

type Row = Record<string, unknown>;

const isRow = (v: unknown): v is Row => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const int = (v: unknown, fallback = 0): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : fallback;
};
const limit = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.trunc(v) : null;
/** Drapeau absent = fonction disponible (le serveur fait foi). */
const flag = (v: unknown): boolean => v !== false;

const STATUSES: EntitlementStatus[] = ["TRIAL", "ACTIVE", "GRACE", "EXPIRED", "NONE"];

export function parseLimits(raw: unknown): PlanLimits {
  const r = isRow(raw) ? raw : {};
  return {
    users_max: limit(r.users_max),
    customers_max: limit(r.customers_max),
    orders_max: limit(r.orders_max),
    storage_mb: limit(r.storage_mb),
    whatsapp: flag(r.whatsapp),
    stock: flag(r.stock),
    audit: flag(r.audit),
  };
}

function parsePlan(raw: unknown): PlanInfo | null {
  if (!isRow(raw) || !str(raw.code)) return null;
  return {
    code: String(raw.code),
    name: str(raw.name) ?? String(raw.code),
    description: str(raw.description),
    priceMonthly: int(raw.price_monthly),
    currency: str(raw.currency) ?? "XOF",
    limits: parseLimits(raw.limits),
    features: Array.isArray(raw.features) ? raw.features.filter((f): f is string => typeof f === "string") : [],
    trialDays: int(raw.trial_days),
    isDefault: raw.is_default === true,
  };
}

/** Lecture défensive de la réponse de `my_entitlements` (ou du cache local). */
export function parseEntitlements(raw: unknown): Entitlements | null {
  if (!isRow(raw) || !str(raw.plan_code)) return null;
  const usage = isRow(raw.usage) ? raw.usage : {};
  const status = String(raw.status) as EntitlementStatus;
  return {
    planCode: String(raw.plan_code),
    planName: str(raw.plan_name) ?? String(raw.plan_code),
    limits: parseLimits(raw.limits),
    status: STATUSES.includes(status) ? status : "NONE",
    subscribedPlanCode: str(raw.subscribed_plan_code),
    trialEndsAt: str(raw.trial_ends_at),
    periodEnd: str(raw.current_period_end),
    graceEndsAt: str(raw.grace_ends_at),
    priceMonthly: int(raw.price_monthly),
    currency: str(raw.currency) ?? "XOF",
    requestedPlanCode: str(raw.requested_plan_code),
    requestedAt: str(raw.requested_at),
    usage: {
      users: int(usage.users),
      pendingInvitations: int(usage.pending_invitations),
      customers: int(usage.customers),
      orders: int(usage.orders),
      storageBytes: int(usage.storage_bytes),
    },
    plans: (Array.isArray(raw.plans) ? raw.plans : []).map(parsePlan).filter((p): p is PlanInfo => p !== null),
  };
}

/** Forme sérialisable (cache local) : celle du serveur, relue par parseEntitlements. */
export function serializeEntitlements(e: Entitlements): Row {
  return {
    plan_code: e.planCode,
    plan_name: e.planName,
    limits: e.limits,
    status: e.status,
    subscribed_plan_code: e.subscribedPlanCode,
    trial_ends_at: e.trialEndsAt,
    current_period_end: e.periodEnd,
    grace_ends_at: e.graceEndsAt,
    price_monthly: e.priceMonthly,
    currency: e.currency,
    requested_plan_code: e.requestedPlanCode,
    requested_at: e.requestedAt,
    usage: {
      users: e.usage.users,
      pending_invitations: e.usage.pendingInvitations,
      customers: e.usage.customers,
      orders: e.usage.orders,
      storage_bytes: e.usage.storageBytes,
    },
    plans: e.plans.map((p) => ({
      code: p.code,
      name: p.name,
      description: p.description,
      price_monthly: p.priceMonthly,
      currency: p.currency,
      limits: p.limits,
      features: p.features,
      trial_days: p.trialDays,
      is_default: p.isDefault,
    })),
  };
}

const LIMIT_KEYS: Record<LimitKind, keyof PlanLimits> = {
  users: "users_max",
  customers: "customers_max",
  orders: "orders_max",
  storage: "storage_mb",
};

export function limitOf(limits: PlanLimits, kind: LimitKind): number | null {
  return limits[LIMIT_KEYS[kind]] as number | null;
}

/** Usage tel que le serveur le compte (les invitations en attente occupent une place). */
export function usedOf(usage: Usage, kind: LimitKind): number {
  switch (kind) {
    case "users":
      return usage.users + usage.pendingInvitations;
    case "customers":
      return usage.customers;
    case "orders":
      return usage.orders;
    case "storage":
      return Math.ceil(usage.storageBytes / (1024 * 1024));
  }
}

export type AddCheck = { ok: true } | { ok: false; code: string; limit: number };

/**
 * Peut-on créer un élément de plus ? `localUsed` : décompte de l'appareil
 * (créations hors ligne pas encore envoyées) — on retient le plus grand.
 * Sans droits connus (mode démo, premier lancement hors ligne) : autorisé,
 * le serveur tranchera.
 */
export function canAdd(e: Entitlements | null, kind: Exclude<LimitKind, "storage">, localUsed = 0): AddCheck {
  if (!e) return { ok: true };
  const max = limitOf(e.limits, kind);
  if (max === null) return { ok: true };
  const used = Math.max(usedOf(e.usage, kind), localUsed);
  return used < max ? { ok: true } : { ok: false, code: `PLAN_LIMIT:${kind}`, limit: max };
}

export function featureEnabled(e: Entitlements | null, feature: FeatureFlag): boolean {
  return e === null ? true : e.limits[feature];
}

export interface Meter {
  kind: LimitKind;
  used: number;
  limit: number | null;
  percent: number;
  level: "ok" | "near" | "full";
}

export function meters(e: Entitlements): Meter[] {
  return (["customers", "orders", "users", "storage"] as LimitKind[]).map((kind) => {
    const used = usedOf(e.usage, kind);
    const max = limitOf(e.limits, kind);
    const percent = max === null || max === 0 ? (max === 0 && used > 0 ? 100 : 0) : Math.min(100, Math.round((used / max) * 100));
    const level = max === null ? "ok" : used >= max ? "full" : percent >= 80 ? "near" : "ok";
    return { kind, used, limit: max, percent, level };
  });
}

/** Jours entiers restants avant une date (0 si passée). */
export function daysLeft(iso: string | null, now: Date = new Date()): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - now.getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

export type Notice =
  | { kind: "trial-ending"; days: number }
  | { kind: "grace"; until: string | null }
  | { kind: "expired"; plan: string | null };

/** Bandeau à afficher en haut de l'application (null = rien à signaler). */
export function noticeFor(e: Entitlements | null, now: Date = new Date()): Notice | null {
  if (!e) return null;
  if (e.status === "TRIAL") {
    const days = daysLeft(e.trialEndsAt, now);
    return days !== null && days <= 5 ? { kind: "trial-ending", days } : null;
  }
  if (e.status === "GRACE") return { kind: "grace", until: e.graceEndsAt };
  if (e.status === "EXPIRED") return { kind: "expired", plan: e.subscribedPlanCode };
  return null;
}

export type PlanAction = "current" | "switch" | "request" | "requested";

/** Action proposée sur une carte de plan : gratuit = immédiat, payant = demande. */
export function planAction(e: Entitlements, plan: PlanInfo): PlanAction {
  if (plan.code === e.planCode && e.status !== "EXPIRED") return "current";
  if (e.status === "EXPIRED" && plan.code === e.planCode && plan.priceMonthly === 0) return "current";
  if (e.requestedPlanCode === plan.code) return "requested";
  return plan.priceMonthly === 0 ? "switch" : "request";
}

const KIND_LABELS: Record<LimitKind, string> = {
  customers: "clients",
  orders: "commandes en cours",
  users: "utilisateurs",
  storage: "Mo de stockage",
};

export const METER_LABELS: Record<LimitKind, string> = {
  customers: "Clients",
  orders: "Commandes en cours",
  users: "Utilisateurs",
  storage: "Stockage",
};

export const FEATURE_LABELS: Record<FeatureFlag, string> = {
  whatsapp: "Rappels WhatsApp",
  stock: "Stock & tissus",
  audit: "Journal d'audit",
};

export const STATUS_LABELS: Record<EntitlementStatus, string> = {
  TRIAL: "Essai gratuit",
  ACTIVE: "Actif",
  GRACE: "Paiement attendu",
  EXPIRED: "Expiré",
  NONE: "Sans abonnement",
};

/** Message en français pour un refus du serveur ou un blocage préventif. */
export function planErrorMessage(code: string | null | undefined, limitValue?: number): string | null {
  if (!code) return null;
  const limitMatch = /^PLAN_LIMIT:(users|customers|orders|storage)$/.exec(code);
  if (limitMatch) {
    const kind = limitMatch[1] as LimitKind;
    const max = limitValue !== undefined ? ` (${limitValue} ${KIND_LABELS[kind]})` : "";
    switch (kind) {
      case "customers":
        return `Limite de clients de votre plan atteinte${max}. Passez à un plan supérieur pour en ajouter.`;
      case "orders":
        return `Limite de commandes en cours atteinte${max}. Livrez ou annulez une commande, ou passez à un plan supérieur.`;
      case "users":
        return `Nombre d'utilisateurs maximum atteint${max}. Retirez une invitation ou passez à un plan supérieur.`;
      case "storage":
        return "Espace de stockage de votre plan plein. Supprimez des photos ou passez à un plan supérieur.";
    }
  }
  if (code === "PLAN_FEATURE:stock") return "La gestion du stock n'est pas incluse dans votre plan.";
  if (code === "PLAN_FEATURE:whatsapp") return "Les rappels WhatsApp ne sont pas inclus dans votre plan.";
  return null;
}

export function isPlanError(code: string | null | undefined): boolean {
  return typeof code === "string" && /^PLAN_(LIMIT|FEATURE):/.test(code);
}

/** « 5 000 F CFA » — montants entiers, jamais de flottant. */
export function formatPrice(amount: number, currency = "XOF"): string {
  if (amount === 0) return "Gratuit";
  return currency === "XOF" ? formatFcfa(amount) : `${groupThousands(amount)} ${currency}`;
}

export function formatLimit(value: number | null, unit = ""): string {
  if (value === null) return "Illimité";
  if (unit === "Mo" && value >= 1000) {
    const go = value / 1000;
    return `${Number.isInteger(go) ? go : go.toFixed(1).replace(".", ",")} Go`;
  }
  return unit ? `${groupThousands(value)} ${unit}` : groupThousands(value);
}
