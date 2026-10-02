import type { BadgeTone } from "@/ui";
import {
  APPOINTMENT_STATUSES,
  APPOINTMENT_TYPES,
} from "@/domain/appointments/appointments";
import type {
  AppointmentStatus,
  AppointmentType,
} from "@/domain/appointments/appointments";

export const APPOINTMENT_STATUS_META: Record<
  AppointmentStatus,
  { label: string; tone: BadgeTone }
> = {
  SCHEDULED: { label: "Planifié", tone: "neutral" },
  CONFIRMED: { label: "Confirmé", tone: "accent" },
  COMPLETED: { label: "Terminé", tone: "success" },
  CANCELLED: { label: "Annulé", tone: "danger" },
  NO_SHOW: { label: "Absent", tone: "warning" },
};

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> =
  Object.fromEntries(
    APPOINTMENT_STATUSES.map((s) => [s, APPOINTMENT_STATUS_META[s].label]),
  ) as Record<AppointmentStatus, string>;

export const APPOINTMENT_TYPE_META: Record<
  AppointmentType,
  { label: string; tone: BadgeTone }
> = {
  MEASUREMENTS: { label: "Prise de mesures", tone: "primary" },
  FITTING: { label: "Essayage", tone: "info" },
  ALTERATION: { label: "Retouches", tone: "warning" },
  DELIVERY: { label: "Livraison", tone: "success" },
  PICKUP: { label: "Retrait", tone: "accent" },
  PAYMENT: { label: "Paiement", tone: "success" },
  OTHER: { label: "Autre", tone: "neutral" },
};

export const APPOINTMENT_TYPE_LABELS: Record<AppointmentType, string> =
  Object.fromEntries(
    APPOINTMENT_TYPES.map((t) => [t, APPOINTMENT_TYPE_META[t].label]),
  ) as Record<AppointmentType, string>;

export const APPOINTMENT_STATUS_ACTIONS: Record<
  AppointmentStatus,
  { to: AppointmentStatus; label: string }[]
> = {
  SCHEDULED: [
    { to: "CONFIRMED", label: "Confirmer" },
    { to: "COMPLETED", label: "Terminé" },
    { to: "NO_SHOW", label: "Absent" },
    { to: "CANCELLED", label: "Annuler" },
  ],
  CONFIRMED: [
    { to: "COMPLETED", label: "Terminé" },
    { to: "NO_SHOW", label: "Absent" },
    { to: "CANCELLED", label: "Annuler" },
  ],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [
    { to: "COMPLETED", label: "Terminé" },
    { to: "CANCELLED", label: "Annuler" },
  ],
};