import type { BadgeTone } from "@/ui";
import {
  ORDER_PRIORITIES,
  ORDER_STATUSES,
  type OrderPriority,
  type OrderStatus,
} from "@/domain/orders/order";

/**
 * Libellés des statuts = libellés des 4 étapes (stages.ts) : partout dans
 * l'application, une commande est « Reçue », « En couture », « Prête » ou
 * « Livrée » — jamais un mot d'atelier de plus. Commandes = ORANGE ;
 * prête = vert ; livrée = bleu ; annulée = rouge.
 */
export const ORDER_STATUS_META: Record<
  OrderStatus,
  { label: string; tone: BadgeTone }
> = {
  REGISTERED: { label: "Reçue", tone: "neutral" },
  FABRIC_RECEIVED: { label: "Reçue", tone: "neutral" },
  PREPARATION: { label: "En couture", tone: "accent" },
  SEWING: { label: "En couture", tone: "accent" },
  FITTING: { label: "En couture", tone: "accent" },
  ALTERATION: { label: "En couture", tone: "accent" },
  COMPLETED: { label: "Prête", tone: "success" },
  READY_FOR_PICKUP: { label: "Prête", tone: "success" },
  DELIVERED: { label: "Livrée", tone: "info" },
  CANCELLED: { label: "Annulée", tone: "danger" },
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = Object.fromEntries(
  ORDER_STATUSES.map((s) => [s, ORDER_STATUS_META[s].label]),
) as Record<OrderStatus, string>;

export const ORDER_PRIORITY_META: Record<
  OrderPriority,
  { label: string; tone: BadgeTone }
> = {
  LOW: { label: "Basse", tone: "neutral" },
  NORMAL: { label: "Normale", tone: "accent" },
  HIGH: { label: "Haute", tone: "warning" },
  URGENT: { label: "Urgente", tone: "danger" },
};

export const ORDER_PRIORITY_LABELS: Record<OrderPriority, string> =
  Object.fromEntries(
    ORDER_PRIORITIES.map((p) => [p, ORDER_PRIORITY_META[p].label]),
  ) as Record<OrderPriority, string>;

export const GARMENT_TYPES = [
  "Robe",
  "Robe de mariée",
  "Jupe",
  "Ensemble",
  "Chemisier",
  "Pantalon",
  "Boubou",
  "Gandoura",
  "Voile",
  "Turban",
  "Autre",
] as const;