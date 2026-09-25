import type { BadgeTone } from "@/ui";
import {
  ORDER_PRIORITIES,
  ORDER_STATUSES,
  type OrderPriority,
  type OrderStatus,
} from "@/domain/orders/order";

export const ORDERS_DEMO_TENANT_ID = "0171c000-0000-4000-8000-000000000001";
export const ORDERS_DEMO_PROFILE_ID = "0171c000-0000-4000-8000-000000000002";

export const ORDER_STATUS_META: Record<
  OrderStatus,
  { label: string; tone: BadgeTone }
> = {
  REGISTERED: { label: "Enregistrée", tone: "neutral" },
  FABRIC_RECEIVED: { label: "Tissu reçu", tone: "info" },
  PREPARATION: { label: "Préparation", tone: "info" },
  SEWING: { label: "En couture", tone: "info" },
  FITTING: { label: "Essayage", tone: "info" },
  ALTERATION: { label: "Retouches", tone: "warning" },
  COMPLETED: { label: "Terminée", tone: "success" },
  READY_FOR_PICKUP: { label: "À retirer", tone: "accent" },
  DELIVERED: { label: "Livrée", tone: "success" },
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
  NORMAL: { label: "Normale", tone: "primary" },
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