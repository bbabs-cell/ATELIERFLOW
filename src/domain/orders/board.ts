import {
  canTransition,
  isTerminal,
  ORDER_FLOW,
  type OrderPriority,
  type OrderRecord,
  type OrderStatus,
} from "./order";

/**
 * Kanban de l'atelier (prompt 14) — logique pure.
 * Une colonne par étape du flux (REGISTERED → DELIVERED) ; les commandes
 * annulées ne sont pas sur le tableau. Un déplacement n'est accepté que
 * s'il respecte les transitions du domaine (canTransition) : le tableau
 * ne contourne jamais les règles de l'historique.
 */

export const BOARD_STATUSES: readonly OrderStatus[] = ORDER_FLOW;

export type DeadlineState = "late" | "today" | "soon" | "ok" | "none";

/** Jours calendaires entre deux dates ISO (AAAA-MM-JJ). */
function dayDiff(fromIsoDay: string, toIsoDay: string): number {
  const a = Date.UTC(+fromIsoDay.slice(0, 4), +fromIsoDay.slice(5, 7) - 1, +fromIsoDay.slice(8, 10));
  const b = Date.UTC(+toIsoDay.slice(0, 4), +toIsoDay.slice(5, 7) - 1, +toIsoDay.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

/**
 * Échéance : en retard si la date prévue est passée et que la commande
 * n'est ni livrée ni annulée ni déjà prête à retirer (le travail de
 * l'atelier est alors terminé).
 */
export function deadlineState(order: Pick<OrderRecord, "expected_at" | "status">, today: string): DeadlineState {
  if (!order.expected_at || isTerminal(order.status) || order.status === "READY_FOR_PICKUP") {
    return "none";
  }
  const days = dayDiff(today.slice(0, 10), order.expected_at.slice(0, 10));
  if (days < 0) return "late";
  if (days === 0) return "today";
  if (days <= 2) return "soon";
  return "ok";
}

export function daysLate(order: Pick<OrderRecord, "expected_at">, today: string): number {
  if (!order.expected_at) return 0;
  return Math.max(0, dayDiff(order.expected_at.slice(0, 10), today.slice(0, 10)));
}

export interface BoardFilters {
  priority: OrderPriority | "ALL";
  /** "ALL", "UNASSIGNED" ou l'identifiant de profil affecté. */
  assignee: string;
  lateOnly: boolean;
}

export const DEFAULT_BOARD_FILTERS: BoardFilters = { priority: "ALL", assignee: "ALL", lateOnly: false };

export function matchesFilters(
  order: Pick<OrderRecord, "priority" | "employee_id" | "expected_at" | "status">,
  filters: BoardFilters,
  today: string,
): boolean {
  if (filters.priority !== "ALL" && order.priority !== filters.priority) return false;
  if (filters.assignee === "UNASSIGNED" && order.employee_id !== null) return false;
  if (filters.assignee !== "ALL" && filters.assignee !== "UNASSIGNED" && order.employee_id !== filters.assignee) {
    return false;
  }
  if (filters.lateOnly && deadlineState(order, today) !== "late") return false;
  return true;
}

const PRIORITY_RANK: Record<OrderPriority, number> = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };
const DEADLINE_RANK: Record<DeadlineState, number> = { late: 0, today: 1, soon: 2, ok: 3, none: 4 };

/** Ordre dans une colonne : retard, priorité, échéance la plus proche, ancienneté. */
export function compareForBoard(
  a: Pick<OrderRecord, "priority" | "expected_at" | "status" | "created_at">,
  b: Pick<OrderRecord, "priority" | "expected_at" | "status" | "created_at">,
  today: string,
): number {
  const late = DEADLINE_RANK[deadlineState(a, today)] - DEADLINE_RANK[deadlineState(b, today)];
  if (late !== 0 && (deadlineState(a, today) === "late" || deadlineState(b, today) === "late")) return late;
  const prio = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (prio !== 0) return prio;
  const ea = a.expected_at ?? "9999-12-31";
  const eb = b.expected_at ?? "9999-12-31";
  if (ea !== eb) return ea < eb ? -1 : 1;
  return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
}

export function groupForBoard<T extends { order: OrderRecord }>(
  rows: readonly T[],
  filters: BoardFilters,
  today: string,
): Map<OrderStatus, T[]> {
  const columns = new Map<OrderStatus, T[]>(BOARD_STATUSES.map((s) => [s, []]));
  for (const row of rows) {
    const column = columns.get(row.order.status);
    if (!column) continue;
    if (!matchesFilters(row.order, filters, today)) continue;
    column.push(row);
  }
  for (const column of columns.values()) {
    column.sort((x, y) => compareForBoard(x.order, y.order, today));
  }
  return columns;
}

/** Déplacement par glisser-déposer : transitions du domaine, jamais l'annulation. */
export function canDrop(from: OrderStatus, to: OrderStatus): boolean {
  return to !== "CANCELLED" && canTransition(from, to);
}

/** Étape suivante directe dans le flux (bouton « → » sur les cartes). */
export function nextStatus(from: OrderStatus): OrderStatus | null {
  if (isTerminal(from)) return null;
  const index = ORDER_FLOW.indexOf(from);
  const next = index >= 0 ? ORDER_FLOW[index + 1] : undefined;
  return next && canTransition(from, next) ? next : null;
}
