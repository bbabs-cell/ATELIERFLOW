import type { BadgeTone } from "@/ui";
import type { PlanCode } from "@/domain/subscriptions/plans";
import { PLAN_CODES } from "@/domain/subscriptions/plans";
import type { SubscriptionStatus } from "@/domain/subscriptions/plans";

export const PLAN_META: Record<PlanCode, { tone: BadgeTone; highlight: boolean }> = {
  FREE: { tone: "neutral", highlight: false },
  BASIC: { tone: "primary", highlight: false },
  PRO: { tone: "danger", highlight: true },
};

export const PLAN_OPTIONS: PlanCode[] = [...PLAN_CODES];

export const SUBSCRIPTION_STATUS_META: Record<
  SubscriptionStatus,
  { label: string; tone: BadgeTone }
> = {
  TRIAL: { label: "Essai", tone: "info" },
  ACTIVE: { label: "Active", tone: "success" },
  PAST_DUE: { label: "En retard", tone: "warning" },
  CANCELLED: { label: "Annulée", tone: "danger" },
  EXPIRED: { label: "Expirée", tone: "neutral" },
};

export const RESOURCE_KINDS = ["users", "customers", "orders", "storage"] as const;