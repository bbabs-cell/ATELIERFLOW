import {
  isTerminal,
  type OrderPriority,
  type OrderRecord,
  type OrderStatus,
} from "./order";
import { ORDER_STAGES, stageOf, statusForStage, type OrderStage } from "./stages";

/**
 * Tableau de l'atelier — logique pure.
 * Une colonne par étape simple (Reçue, En couture, Prête, Livrée : stages.ts) ;
 * les commandes annulées ne sont pas sur le tableau. Un déplacement n'est
 * accepté que s'il respecte les transitions du domaine (statusForStage →
 * canTransition) : le tableau ne contourne jamais les règles de l'historique.
 */

export const BOARD_STAGES: readonly OrderStage[] = ORDER_STAGES;

export type DeadlineState = "late" | "today" | "soon" | "ok" | "none";

/** Jours calendaires entre deux dates ISO (AAAA-MM-JJ). */
function dayDiff(fromIsoDay: string, toIsoDay: string): number {
  const a = Date.UTC(+fromIsoDay.slice(0, 4), +fromIsoDay.slice(5, 7) - 1, +fromIsoDay.slice(8, 10));
  const b = Date.UTC(+toIsoDay.slice(0, 4), +toIsoDay.slice(5, 7) - 1, +toIsoDay.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

/**
 * Échéance : en retard si la date prévue est passée et que la commande
 * n'est ni livrée ni annulée ni déjà prête (le travail de l'atelier est
 * alors terminé).
 */
export function deadlineState(order: Pick<OrderRecord, "expected_at" | "status">, today: string): DeadlineState {
  if (!order.expected_at || isTerminal(order.status) || stageOf(order.status) === "READY") {
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
): Map<OrderStage, T[]> {
  const columns = new Map<OrderStage, T[]>(BOARD_STAGES.map((s) => [s, []]));
  for (const row of rows) {
    const stage = stageOf(row.order.status);
    const column = stage ? columns.get(stage) : undefined;
    if (!column) continue;
    if (!matchesFilters(row.order, filters, today)) continue;
    column.push(row);
  }
  for (const column of columns.values()) {
    column.sort((x, y) => compareForBoard(x.order, y.order, today));
  }
  return columns;
}

/** Déplacement par glisser-déposer vers une étape : transitions du domaine, jamais l'annulation. */
export function canDrop(from: OrderStatus, to: OrderStage): boolean {
  return statusForStage(from, to) !== null;
}

export interface DeadlineWords {
  /** « En retard de 2 jours », « Aujourd'hui », « Demain », « Dans 3 jours », « Le 24 déc. ». */
  text: string;
  state: DeadlineState;
}

/**
 * Échéance en mots plutôt qu'en date à décompter de tête (méthode : « dans
 * 3 jours », « dépassée de 2 jours ») — lisible et prononçable à voix haute.
 * null : pas de date, ou commande déjà prête, livrée ou annulée.
 */
export function deadlineWords(order: Pick<OrderRecord, "expected_at" | "status">, today: string): DeadlineWords | null {
  const state = deadlineState(order, today);
  if (state === "none" || !order.expected_at) return null;
  const days = dayDiff(today.slice(0, 10), order.expected_at.slice(0, 10));
  if (days < 0) return { state, text: `En retard de ${-days} jour${days < -1 ? "s" : ""}` };
  if (days === 0) return { state, text: "Aujourd'hui" };
  if (days === 1) return { state, text: "Demain" };
  if (days <= 6) return { state, text: `Dans ${days} jours` };
  const date = new Date(`${order.expected_at.slice(0, 10)}T12:00:00Z`);
  return { state, text: `Le ${date.toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" })}` };
}
