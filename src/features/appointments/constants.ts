import type { BadgeTone } from "@/ui";
import {
  APPOINTMENT_STATUSES,
  APPOINTMENT_TYPES,
} from "@/domain/appointments/appointments";
import type {
  AppointmentStatus,
  AppointmentType,
} from "@/domain/appointments/appointments";

/** Rendez-vous = BLEU ; paiement = vert (argent) ; annulé / absent = rouge. */
export const APPOINTMENT_STATUS_META: Record<
  AppointmentStatus,
  { label: string; tone: BadgeTone }
> = {
  SCHEDULED: { label: "Planifié", tone: "neutral" },
  CONFIRMED: { label: "Confirmé", tone: "blue" },
  COMPLETED: { label: "Terminé", tone: "info" },
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
  MEASUREMENTS: { label: "Prise de mesures", tone: "blue" },
  FITTING: { label: "Essayage", tone: "blue" },
  ALTERATION: { label: "Retouches", tone: "blue" },
  DELIVERY: { label: "Livraison", tone: "blue" },
  PICKUP: { label: "Retrait", tone: "blue" },
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