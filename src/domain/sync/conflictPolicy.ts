import type { ConflictClass } from "./types";

export const FINANCIAL_ENTITIES: readonly string[] = [
  "payments",
  "receipts",
  "subscriptions",
  "order_status_history",
  "stock_movements",
];

export const SENSITIVE_ENTITIES: readonly string[] = [
  "customers",
  "measurement_profiles",
  "measurement_snapshots",
  "orders",
  "order_items",
  "alterations",
  "appointments",
];

export function classifyEntity(entity: string): ConflictClass {
  if ((FINANCIAL_ENTITIES as readonly string[]).includes(entity)) {
    return "financial";
  }
  if ((SENSITIVE_ENTITIES as readonly string[]).includes(entity)) {
    return "sensitive";
  }
  return "metadata";
}

export function isFinancialEntity(entity: string): boolean {
  return classifyEntity(entity) === "financial";
}

export function requiresManualReview(entity: string): boolean {
  const klass = classifyEntity(entity);
  return klass === "financial" || klass === "sensitive";
}

export function serverIsReference(entity: string): boolean {
  return classifyEntity(entity) === "metadata";
}
/**
 * Version à garder sur l'appareil après une opération confirmée (SYNCED).
 * - métadonnées : la version serveur fait foi ;
 * - reçus : immuables et calculés par le serveur (référence REC définitive,
 *   état du solde, montant) → version serveur, complétée par les champs
 *   locaux absents ;
 * - commandes : la référence ORD définitive est attribuée par le serveur →
 *   on la reprend, le reste des saisies locales est conservé ;
 * - autres entités sensibles / financières : la copie locale reste.
 * Retourne null quand rien ne change.
 */
export function adoptServerRecord(entity: string, local: unknown, server: unknown): unknown | null {
  if (server === null || typeof server !== "object") return null;
  if (serverIsReference(entity)) return server;
  const base = local !== null && typeof local === "object" ? (local as Record<string, unknown>) : null;
  const remote = server as Record<string, unknown>;
  if (entity === "receipts") return { ...(base ?? {}), ...remote };
  if (entity === "orders" && base && typeof remote.reference === "string" && remote.reference !== base.reference) {
    return { ...base, reference: remote.reference };
  }
  return null;
}
