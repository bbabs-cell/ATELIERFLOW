import { canTransition, type OrderStatus } from "./order";

/**
 * Les 4 étapes de l'atelier, vues par la personne qui coud.
 *
 * Pourquoi : le suivi comptait 9 étapes (tissu reçu, préparation, essayage,
 * retouches, terminée, à retirer…). Le propriétaire : « trop d'étapes pour
 * préparer un habit » ; l'écran doit se comprendre sans savoir lire. On garde
 * les statuts enregistrés (historique, synchronisation, base inchangés) et on
 * les regroupe en 4 étapes : Reçue → En couture → Prête → Livrée. Un toucher
 * fait passer à l'étape suivante ; une commande ancienne à une étape
 * intermédiaire (essayage, retouches…) est rangée dans l'étape qui la contient.
 */
export const ORDER_STAGES = ["RECEIVED", "SEWING", "READY", "DELIVERED"] as const;
export type OrderStage = (typeof ORDER_STAGES)[number];

const STAGE_OF: Record<OrderStatus, OrderStage | null> = {
  REGISTERED: "RECEIVED",
  FABRIC_RECEIVED: "RECEIVED",
  PREPARATION: "SEWING",
  SEWING: "SEWING",
  FITTING: "SEWING",
  ALTERATION: "SEWING",
  COMPLETED: "READY",
  READY_FOR_PICKUP: "READY",
  DELIVERED: "DELIVERED",
  CANCELLED: null,
};

/** Statut enregistré quand une commande arrive dans une étape. */
export const STAGE_STATUS: Record<OrderStage, OrderStatus> = {
  RECEIVED: "REGISTERED",
  SEWING: "SEWING",
  READY: "READY_FOR_PICKUP",
  DELIVERED: "DELIVERED",
};

/** Étape d'un statut (null : commande annulée, hors du tableau). */
export function stageOf(status: OrderStatus): OrderStage | null {
  return STAGE_OF[status];
}

export function stageIndex(stage: OrderStage): number {
  return ORDER_STAGES.indexOf(stage);
}

/**
 * Statut à enregistrer pour faire passer une commande à une étape, ou null si
 * le passage n'est pas permis (même étape, commande livrée ou annulée, retour
 * de plus d'une étape).
 */
export function statusForStage(from: OrderStatus, stage: OrderStage): OrderStatus | null {
  const current = stageOf(from);
  if (current === null || current === stage) return null;
  const to = STAGE_STATUS[stage];
  if (stageIndex(stage) < stageIndex(current) - 1) return null;
  return canTransition(from, to) ? to : null;
}

/** Étape suivante (le gros bouton de la carte), ou null si la commande est livrée/annulée. */
export function nextStage(status: OrderStatus): OrderStage | null {
  const current = stageOf(status);
  if (current === null) return null;
  const next = ORDER_STAGES[stageIndex(current) + 1];
  return next !== undefined && statusForStage(status, next) !== null ? next : null;
}

/** Étape précédente (« Revenir »), pour corriger un toucher par erreur. */
export function previousStage(status: OrderStatus): OrderStage | null {
  const current = stageOf(status);
  if (current === null || current === "DELIVERED") return null;
  const previous = ORDER_STAGES[stageIndex(current) - 1];
  return previous !== undefined && statusForStage(status, previous) !== null ? previous : null;
}
