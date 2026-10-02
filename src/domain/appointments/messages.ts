import type { AppointmentRecord, AppointmentType } from "./appointments";

/**
 * Messages WhatsApp des rendez-vous (prompt 17) : générés depuis le
 * rendez-vous, puis relus et modifiés par l'utilisateur avant l'envoi.
 */

export const APPOINTMENT_MESSAGE_KINDS = ["REMINDER", "CONFIRMATION", "RESCHEDULED", "CANCELLED"] as const;
export type AppointmentMessageKind = (typeof APPOINTMENT_MESSAGE_KINDS)[number];

export const APPOINTMENT_MESSAGE_LABELS: Record<AppointmentMessageKind, string> = {
  REMINDER: "Rappel",
  CONFIRMATION: "Confirmation",
  RESCHEDULED: "Changement d'horaire",
  CANCELLED: "Annulation",
};

/** Objet du rendez-vous dans une phrase, avec son genre et son nombre (accords). */
const SUBJECT: Record<AppointmentType, { text: string; feminine: boolean; plural: boolean }> = {
  MEASUREMENTS: { text: "votre prise de mesures", feminine: true, plural: false },
  FITTING: { text: "votre essayage", feminine: false, plural: false },
  ALTERATION: { text: "vos retouches", feminine: true, plural: true },
  DELIVERY: { text: "la livraison de votre commande", feminine: true, plural: false },
  PICKUP: { text: "le retrait de votre commande", feminine: false, plural: false },
  PAYMENT: { text: "votre rendez-vous pour le règlement", feminine: false, plural: false },
  OTHER: { text: "votre rendez-vous", feminine: false, plural: false },
};

/** « prévu » → « prévue », « prévus », « prévues ». */
function agree(participle: string, subject: { feminine: boolean; plural: boolean }): string {
  return `${participle}${subject.feminine ? "e" : ""}${subject.plural ? "s" : ""}`;
}

export interface AppointmentMessageInput {
  kind: AppointmentMessageKind;
  appointment: Pick<AppointmentRecord, "type" | "starts_at">;
  customerName: string | null;
  atelierName: string;
  atelierAddress?: string | null;
  orderReference?: string | null;
  now: string;
  timeZone?: string;
}

/** Jour calendaire (AAAA-MM-JJ) d'un instant dans un fuseau. */
function dayKey(iso: string, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / 86_400_000);
}

/** « aujourd'hui », « demain (samedi 3 octobre) », « le mardi 6 octobre ». */
export function relativeDayLabel(startsAt: string, now: string, timeZone?: string): string {
  const date = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone }).format(new Date(startsAt));
  const diff = daysBetween(dayKey(now, timeZone), dayKey(startsAt, timeZone));
  if (diff === 0) return "aujourd'hui";
  if (diff === 1) return `demain (${date})`;
  return `le ${date}`;
}

export function timeLabel(startsAt: string, timeZone?: string): string {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone }).format(new Date(startsAt));
}

function firstName(name: string | null): string | null {
  const first = name?.trim().split(/\s+/)[0];
  return first ? first : null;
}

export function buildAppointmentMessage(input: AppointmentMessageInput): string {
  const s = SUBJECT[input.appointment.type];
  const subject = s.text;
  const is = s.plural ? "sont" : "est";
  const when = `${relativeDayLabel(input.appointment.starts_at, input.now, input.timeZone)} à ${timeLabel(input.appointment.starts_at, input.timeZone)}`;
  const name = firstName(input.customerName);
  const hello = name ? `Bonjour ${name},` : "Bonjour,";
  const order = input.orderReference ? ` (commande ${input.orderReference})` : "";
  const where = input.atelierAddress ? `\nAdresse : ${input.atelierAddress}.` : "";
  const signature = `\n${input.atelierName}`;

  switch (input.kind) {
    case "REMINDER":
      return `${hello} petit rappel : ${subject}${order} chez ${input.atelierName} ${is} ${agree("prévu", s)} ${when}.${where}\nMerci de nous prévenir en cas d'empêchement.${signature}`;
    case "CONFIRMATION":
      return `${hello} ${subject}${order} ${is} bien ${agree("enregistré", s)} pour ${when}.${where}\nÀ bientôt !${signature}`;
    case "RESCHEDULED":
      return `${hello} ${subject}${order} ${s.plural ? "ont" : "a"} été ${agree("déplacé", s)} : nouveau rendez-vous ${when}.${where}\nMerci de nous dire si ce nouvel horaire ne vous convient pas.${signature}`;
    case "CANCELLED":
      return `${hello} ${subject}${order} ${agree("prévu", s)} ${when} ${is} ${agree("annulé", s)}.\nContactez-nous pour fixer une nouvelle date.${signature}`;
  }
}

/** Fenêtre des rappels : rendez-vous à venir d'ici la fin de demain. */
export const REMINDER_HORIZON_DAYS = 1;

/**
 * Rappel à envoyer : rendez-vous actif (planifié ou confirmé), pas encore
 * passé, aujourd'hui ou demain, sans rappel déjà envoyé.
 */
export function reminderDue(
  appointment: Pick<AppointmentRecord, "status" | "starts_at" | "reminder_sent_at">,
  now: string,
  timeZone?: string,
): boolean {
  if (appointment.status !== "SCHEDULED" && appointment.status !== "CONFIRMED") return false;
  if (appointment.reminder_sent_at) return false;
  if (Date.parse(appointment.starts_at) <= Date.parse(now)) return false;
  return daysBetween(dayKey(now, timeZone), dayKey(appointment.starts_at, timeZone)) <= REMINDER_HORIZON_DAYS;
}

/** Message proposé par défaut selon l'état du rendez-vous. */
export function defaultMessageKind(appointment: Pick<AppointmentRecord, "status">): AppointmentMessageKind {
  return appointment.status === "CANCELLED" ? "CANCELLED" : "REMINDER";
}
