export const APPOINTMENT_TYPES = [
  "MEASUREMENTS",
  "FITTING",
  "ALTERATION",
  "DELIVERY",
  "PICKUP",
  "PAYMENT",
  "OTHER",
] as const;

export type AppointmentType = (typeof APPOINTMENT_TYPES)[number];

export const APPOINTMENT_STATUSES = [
  "SCHEDULED",
  "CONFIRMED",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
] as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const APPOINTMENT_TYPE_LABELS: Record<AppointmentType, string> = {
  MEASUREMENTS: "Prise de mesures",
  FITTING: "Essayage",
  ALTERATION: "Retouches",
  DELIVERY: "Livraison",
  PICKUP: "Retrait",
  PAYMENT: "Paiement",
  OTHER: "Autre",
};

export interface AppointmentRecord {
  id: string;
  tenant_id: string;
  customer_id: string;
  order_id: string | null;
  type: AppointmentType;
  starts_at: string;
  ends_at: string | null;
  status: AppointmentStatus;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface AppointmentDraftInput {
  customerId: string;
  orderId?: string | null;
  type: string;
  startsAt: string;
  endsAt?: string | null;
  note?: string | null;
}

export interface AppointmentDraftClean {
  customerId: string;
  orderId: string | null;
  type: string;
  startsAt: string;
  endsAt: string | null;
  note: string | null;
}

export type AppointmentDraftErrors = Partial<
  Record<"customerId" | "type" | "startsAt" | "endsAt", string>
>;

export function validateAppointmentDraft(
  input: AppointmentDraftInput,
): { value: AppointmentDraftClean; errors: AppointmentDraftErrors } {
  const errors: AppointmentDraftErrors = {};
  if (input.customerId.trim().length === 0) {
    errors.customerId = "Le client est requis.";
  }
  if (!APPOINTMENT_TYPES.includes(input.type as AppointmentType)) {
    errors.type = "Type de rendez-vous invalide.";
  }

  const startsMs = Date.parse(input.startsAt);
  if (!Number.isFinite(startsMs)) {
    errors.startsAt = "Date de début invalide.";
  }
  const endsRaw =
    input.endsAt !== undefined && input.endsAt !== null && input.endsAt.trim() !== ""
      ? input.endsAt
      : null;
  if (endsRaw !== null) {
    const endsMs = Date.parse(endsRaw);
    if (!Number.isFinite(endsMs)) {
      errors.endsAt = "Date de fin invalide.";
    } else if (Number.isFinite(startsMs) && endsMs <= startsMs) {
      errors.endsAt = "La fin doit être après le début.";
    }
  }

  return {
    value: {
      customerId: input.customerId.trim(),
      orderId: input.orderId ?? null,
      type: input.type,
      startsAt: input.startsAt,
      endsAt: endsRaw,
      note: input.note !== undefined && input.note !== null && input.note.trim() !== ""
        ? input.note
        : null,
    },
    errors,
  };
}

export const APPOINTMENT_TRANSITIONS: Record<
  AppointmentStatus,
  readonly AppointmentStatus[]
> = {
  SCHEDULED: ["CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"],
  CONFIRMED: ["COMPLETED", "CANCELLED", "NO_SHOW"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: ["COMPLETED", "CANCELLED"],
};

export function canTransitionAppointment(from: string, to: string): boolean {
  if (!isAppointmentStatus(from)) return false;
  if (!isAppointmentStatus(to)) return false;
  return APPOINTMENT_TRANSITIONS[from].includes(to as AppointmentStatus);
}

export function isAppointmentStatus(value: string): value is AppointmentStatus {
  return APPOINTMENT_STATUSES.includes(value as AppointmentStatus);
}

export function appointmentAfterTransition(
  record: AppointmentRecord,
  to: AppointmentStatus,
  now: string,
): AppointmentRecord {
  return { ...record, status: to, updated_at: now };
}

export function appointmentDayISO(startsAt: string): string {
  const d = new Date(startsAt);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function appointmentTimeLabel(startsAt: string): string {
  const d = new Date(startsAt);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function appointmentDayLabel(dayISO: string): string {
  const d = new Date(`${dayISO}T00:00:00`);
  return d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}