export const ORDER_STATUSES = [
  "REGISTERED",
  "FABRIC_RECEIVED",
  "PREPARATION",
  "SEWING",
  "FITTING",
  "ALTERATION",
  "COMPLETED",
  "READY_FOR_PICKUP",
  "DELIVERED",
  "CANCELLED",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export type OrderPriority = (typeof ORDER_PRIORITIES)[number];

export interface OrderRecord {
  id: string;
  tenant_id: string;
  customer_id: string;
  reference: string;
  status: OrderStatus;
  priority: OrderPriority;
  total_price: number;
  expected_at: string | null;
  delivered_at: string | null;
  employee_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface OrderItemRecord {
  id: string;
  order_id: string;
  tenant_id: string;
  description: string;
  garment_type: string | null;
  measurement_profile_id: string | null;
  fabric_id: string | null;
  fabric_meters: number | null;
  quantity: number;
  unit_price: number;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface OrderStatusHistoryRecord {
  id: string;
  order_id: string;
  tenant_id: string;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  changed_by: string | null;
  note: string | null;
  created_at: string;
}

export interface OrderItemDraft {
  description: string;
  garment_type?: string | null;
  measurement_profile_id?: string | null;
  fabric_id?: string | null;
  fabric_meters?: number | null;
  quantity: number;
  unit_price: number;
  notes?: string | null;
}

export const ORDER_REFERENCE_RE = /^ORD-\d{4}-\d{6}$/;

export function isOrderReference(value: string): boolean {
  return ORDER_REFERENCE_RE.test(value);
}

export function newOrderReference(year: number, sequence: number): string {
  if (!Number.isSafeInteger(year) || year < 2000 || year > 9999) {
    throw new Error("REFERENCE_YEAR_INVALID");
  }
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new Error("REFERENCE_SEQUENCE_INVALID");
  }
  return `ORD-${year}-${String(sequence).padStart(6, "0")}`;
}

export function extractOrderSequence(reference: string): number | null {
  if (!isOrderReference(reference)) return null;
  return Number(reference.slice(reference.length - 6));
}

export function nextOrderSequence(year: number, references: string[]): number {
  const prefix = `ORD-${year}-`;
  const sequences = references
    .filter((ref) => ref.startsWith(prefix))
    .map((ref) => extractOrderSequence(ref))
    .filter((n): n is number => n !== null);
  return sequences.length === 0 ? 1 : Math.max(...sequences) + 1;
}

export const ORDER_FLOW: readonly OrderStatus[] = [
  "REGISTERED",
  "FABRIC_RECEIVED",
  "PREPARATION",
  "SEWING",
  "FITTING",
  "ALTERATION",
  "COMPLETED",
  "READY_FOR_PICKUP",
  "DELIVERED",
];

const FORWARD_ALLOWED_INDICES: Record<OrderStatus, number | null> = {
  REGISTERED: 0,
  FABRIC_RECEIVED: 1,
  PREPARATION: 2,
  SEWING: 3,
  FITTING: 4,
  ALTERATION: 5,
  COMPLETED: 6,
  READY_FOR_PICKUP: 7,
  DELIVERED: null,
  CANCELLED: null,
};

const BACKWARD_ALLOWED: Record<OrderStatus, readonly OrderStatus[]> = {
  REGISTERED: [],
  FABRIC_RECEIVED: ["REGISTERED"],
  PREPARATION: ["FABRIC_RECEIVED", "REGISTERED"],
  SEWING: ["PREPARATION", "FABRIC_RECEIVED"],
  FITTING: ["SEWING", "PREPARATION"],
  ALTERATION: ["FITTING", "SEWING"],
  COMPLETED: ["FITTING", "SEWING"],
  READY_FOR_PICKUP: ["COMPLETED", "FITTING", "SEWING"],
  DELIVERED: ["READY_FOR_PICKUP", "COMPLETED", "FITTING"],
  CANCELLED: [],
};

export function isTerminal(status: OrderStatus): boolean {
  return status === "DELIVERED" || status === "CANCELLED";
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return false;
  if (isTerminal(from)) return false;
  if (to === "CANCELLED") return true;
  const fromIndex = FORWARD_ALLOWED_INDICES[from];
  if (fromIndex !== null && ORDER_FLOW.indexOf(to) > fromIndex) return true;
  return BACKWARD_ALLOWED[from].includes(to);
}

export type TransitionKind = "forward" | "backward" | "cancel";

export interface AvailableTransition {
  to: OrderStatus;
  kind: TransitionKind;
}

export function availableTransitions(from: OrderStatus): AvailableTransition[] {
  const result: AvailableTransition[] = [];
  for (const to of ORDER_STATUSES) {
    if (!canTransition(from, to)) continue;
    if (to === "CANCELLED") {
      result.push({ to, kind: "cancel" });
      continue;
    }
    const fromIndex = FORWARD_ALLOWED_INDICES[from];
    const kind: TransitionKind =
      fromIndex !== null && ORDER_FLOW.indexOf(to) > fromIndex
        ? "forward"
        : "backward";
    result.push({ to, kind });
  }
  return result;
}

export interface TransitionResult {
  status: OrderStatus;
  history: OrderStatusHistoryRecord;
}

export function transitionOrder(
  order: OrderRecord,
  to: OrderStatus,
  input: {
    changedBy: string | null;
    note: string | null;
    now: string;
    historyId: string;
  },
): { ok: false; reason: string } | { ok: true; result: TransitionResult } {
  if (!canTransition(order.status, to)) {
    return {
      ok: false,
      reason: `Transition ${order.status} → ${to} interdite.`,
    };
  }
  if (to === "CANCELLED" && !input.note?.trim()) {
    return { ok: false, reason: "Une raison d'annulation est obligatoire." };
  }
  const history: OrderStatusHistoryRecord = {
    id: input.historyId,
    order_id: order.id,
    tenant_id: order.tenant_id,
    from_status: order.status,
    to_status: to,
    changed_by: input.changedBy,
    note: input.note,
    created_at: input.now,
  };
  return {
    ok: true,
    result: {
      status: to,
      history,
    },
  };
}

export function cancelledOrder(
  order: OrderRecord,
  now: string,
): OrderRecord {
  return { ...order, status: "CANCELLED", updated_at: now };
}

export function orderAfterTransition(
  order: OrderRecord,
  to: OrderStatus,
  now: string,
): OrderRecord {
  return {
    ...order,
    status: to,
    updated_at: now,
    delivered_at: to === "DELIVERED" ? now : order.delivered_at,
  };
}

export function validateOrderItemDraft(
  draft: OrderItemDraft,
): { ok: false; errors: Record<string, string> } | { ok: true; value: OrderItemDraft } {
  const errors: Record<string, string> = {};
  const description = draft.description.trim();
  if (description.length === 0 || description.length > 200) {
    errors.description = "La description est obligatoire (max 200 caractères).";
  }
  if (!Number.isSafeInteger(draft.quantity) || draft.quantity < 1 || draft.quantity > 9999) {
    errors.quantity = "Quantité invalide.";
  }
  if (!Number.isSafeInteger(draft.unit_price) || draft.unit_price < 0) {
    errors.unit_price = "Prix unitaire invalide.";
  }
  if (
    draft.fabric_meters !== null &&
    draft.fabric_meters !== undefined &&
    (!Number.isFinite(draft.fabric_meters) || draft.fabric_meters < 0)
  ) {
    errors.fabric_meters = "Métrage invalide.";
  }
  if (draft.notes && draft.notes.length > 1000) {
    errors.notes = "Note trop longue.";
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: draft };
}