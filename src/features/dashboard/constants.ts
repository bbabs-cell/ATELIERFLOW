import type { BadgeTone } from "@/ui";
import { PAYMENT_MODES } from "@/domain/orders/payments";
import type { PaymentMethod } from "@/domain/orders/payments";

export const DASHBOARD_DEMO_TENANT_ID = "0171c000-0000-4000-8000-000000000001";
export const DASHBOARD_DEMO_PROFILE_ID = "0171c000-0000-4000-8000-000000000002";

export const DASHBOARD_PERIOD_OPTIONS = [
  { days: 7, label: "7 derniers jours" },
  { days: 30, label: "30 derniers jours" },
  { days: 90, label: "3 derniers mois" },
] as const;

export const SEARCH_ENTITY_LABELS = {
  customer: "Clients",
  order: "Commandes",
  fabric: "Tissus",
  appointment: "Rendez-vous",
  member: "Équipe",
} as const;

export const PAYMENT_METHOD_META: Record<PaymentMethod, { label: string; tone: BadgeTone }> = {
  CASH: { label: "Espèces", tone: "success" },
  ORANGE_MONEY: { label: "Orange Money", tone: "info" },
  MOOV_MONEY: { label: "Moov Money", tone: "info" },
  WAVE: { label: "Wave", tone: "accent" },
  TRANSFER: { label: "Virement", tone: "primary" },
  OTHER: { label: "Autre", tone: "neutral" },
};

export const DASHBOARD_PAYMENT_METHODS: PaymentMethod[] = [...PAYMENT_MODES];