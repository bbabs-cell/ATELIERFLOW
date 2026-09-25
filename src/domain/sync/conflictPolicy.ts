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