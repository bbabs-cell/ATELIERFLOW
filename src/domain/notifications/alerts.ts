import { APPOINTMENT_TYPE_LABELS, type AppointmentRecord } from "@/domain/appointments/appointments";
import { reminderDue, timeLabel } from "@/domain/appointments/messages";
import type { Customer } from "@/domain/clients/customer";
import { LOW_STOCK_THRESHOLD_CENTI } from "@/domain/dashboard/kpis";
import type { FabricRecord } from "@/domain/inventory/fabrics";
import type { OrderRecord } from "@/domain/orders/order";
import type { PermissionCode } from "@/domain/team/roles";

/**
 * Alertes de l'atelier (sonnerie + notification) : calculées sur l'appareil
 * à partir des données synchronisées. Chaque alerte a une clé stable : elle
 * ne sonne qu'une fois (les clés déjà jouées sont mémorisées).
 */

export type AlertKind = "APPOINTMENT_SOON" | "REMINDERS_TO_SEND" | "ORDERS_DUE" | "STOCK_LOW";

export interface AtelierAlert {
  key: string;
  kind: AlertKind;
  title: string;
  body: string;
  /** Page à ouvrir en touchant la notification. */
  url: string;
  /** Rendez-vous imminent : sonnerie plus insistante. */
  urgent: boolean;
}

export interface AlertPrefs {
  enabled: boolean;
  sound: boolean;
  /** Minutes avant un rendez-vous (0 = pas d'alerte avant les rendez-vous). */
  leadMinutes: number;
  /** Heure (0-23) à partir de laquelle sonnent les alertes du jour. */
  dailyHour: number;
}

export const DEFAULT_ALERT_PREFS: AlertPrefs = { enabled: false, sound: true, leadMinutes: 30, dailyHour: 8 };
export const LEAD_MINUTES_OPTIONS = [10, 15, 30, 60, 120] as const;

export interface AlertData {
  now: string;
  timeZone?: string;
  permissions: ReadonlySet<PermissionCode>;
  appointments: readonly AppointmentRecord[];
  customers: readonly Customer[];
  orders: readonly OrderRecord[];
  fabrics: readonly FabricRecord[];
}

/** Un rendez-vous commencé depuis plus longtemps ne sonne plus. */
const LATE_GRACE_MS = 5 * 60_000;

function parts(iso: string, timeZone?: string): { day: string; hour: number } {
  const p = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", timeZone }).formatToParts(new Date(iso));
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return { day: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n > 1 ? many : one}`;
}

export function computeAlerts(data: AlertData, prefs: AlertPrefs): AtelierAlert[] {
  if (!prefs.enabled) return [];
  const alerts: AtelierAlert[] = [];
  const nowMs = Date.parse(data.now);
  const { day: today, hour } = parts(data.now, data.timeZone);
  const daily = hour >= prefs.dailyHour;
  const can = (p: PermissionCode) => data.permissions.has(p);
  const nameOf = (id: string) => data.customers.find((c) => c.id === id)?.full_name ?? "Un client";

  if (can("appointments.read")) {
    const open = data.appointments.filter((a) => !a.deleted_at && (a.status === "SCHEDULED" || a.status === "CONFIRMED"));

    // 1. Rendez-vous imminent
    if (prefs.leadMinutes > 0) {
      for (const a of open) {
        const start = Date.parse(a.starts_at);
        if (start - nowMs > prefs.leadMinutes * 60_000 || nowMs - start > LATE_GRACE_MS) continue;
        const minutes = Math.max(0, Math.round((start - nowMs) / 60_000));
        alerts.push({
          // Même clé que le serveur (0028) : la notification push et l'alerte locale se remplacent.
          key: `appt:${a.id}:${Date.parse(a.starts_at)}`,
          kind: "APPOINTMENT_SOON",
          title: minutes > 0 ? `Rendez-vous dans ${minutes} min` : "Rendez-vous maintenant",
          body: `${nameOf(a.customer_id)} — ${APPOINTMENT_TYPE_LABELS[a.type]} à ${timeLabel(a.starts_at, data.timeZone)}`,
          url: "/rdv",
          urgent: true,
        });
      }
    }

    // 2. Rappels WhatsApp à envoyer (aujourd'hui et demain), une fois par jour
    const due = open.filter((a) => reminderDue(a, data.now, data.timeZone));
    if (daily && due.length > 0) {
      alerts.push({
        key: `reminders:${today}`,
        kind: "REMINDERS_TO_SEND",
        title: `${plural(due.length, "rappel", "rappels")} à envoyer`,
        body: `Prévenez ${due.length > 1 ? "vos clients" : nameOf(due[0].customer_id)} par WhatsApp de ${due.length > 1 ? "leurs rendez-vous" : "son rendez-vous"}.`,
        url: "/rdv",
        urgent: false,
      });
    }
  }

  // 3. Commandes à livrer aujourd'hui / en retard, une fois par jour
  if (daily && can("orders.read")) {
    const active = data.orders.filter((o) => !o.deleted_at && o.status !== "DELIVERED" && o.status !== "CANCELLED" && o.expected_at);
    const dueToday = active.filter((o) => o.expected_at!.slice(0, 10) === today).length;
    const late = active.filter((o) => o.expected_at!.slice(0, 10) < today).length;
    if (dueToday + late > 0) {
      const parts2 = [dueToday ? `${plural(dueToday, "commande", "commandes")} à livrer aujourd'hui` : null, late ? `${plural(late, "commande", "commandes")} en retard` : null].filter(Boolean);
      alerts.push({
        key: `orders:${today}`,
        kind: "ORDERS_DUE",
        title: late ? "Commandes en retard" : "Livraisons du jour",
        body: `${parts2.join(", ")}.`,
        url: "/commandes",
        urgent: false,
      });
    }
  }

  // 4. Stock bas, une fois par jour
  if (daily && can("stock.read")) {
    const low = data.fabrics.filter((f) => f.status === "ACTIVE" && f.quantity <= LOW_STOCK_THRESHOLD_CENTI);
    if (low.length > 0) {
      alerts.push({
        key: `stock:${today}`,
        kind: "STOCK_LOW",
        title: "Stock de tissu bas",
        body: low.length === 1 ? `${low[0].name} est presque épuisé.` : `${low.length} tissus sont presque épuisés.`,
        url: "/stock",
        urgent: false,
      });
    }
  }

  return alerts;
}

/** Alertes pas encore jouées, rendez-vous imminents d'abord. */
export function pendingAlerts(alerts: readonly AtelierAlert[], played: ReadonlySet<string>): AtelierAlert[] {
  return alerts.filter((a) => !played.has(a.key)).sort((a, b) => Number(b.urgent) - Number(a.urgent));
}

/** Nettoie les clés jouées : on ne garde que les 3 derniers jours (clés datées) et les 200 dernières. */
export function prunePlayed(keys: readonly string[], today: string): string[] {
  const limit = new Date(`${today}T12:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() - 3);
  const min = limit.toISOString().slice(0, 10);
  return keys
    .filter((k) => {
      const m = /(\d{4}-\d{2}-\d{2})/.exec(k);
      return !m || m[1] >= min;
    })
    .slice(-200);
}

export function normalizePrefs(raw: unknown): AlertPrefs {
  const r = (raw ?? {}) as Partial<AlertPrefs>;
  return {
    enabled: r.enabled === true,
    sound: r.sound !== false,
    leadMinutes: typeof r.leadMinutes === "number" && (r.leadMinutes === 0 || (LEAD_MINUTES_OPTIONS as readonly number[]).includes(r.leadMinutes)) ? r.leadMinutes : DEFAULT_ALERT_PREFS.leadMinutes,
    dailyHour: typeof r.dailyHour === "number" && Number.isInteger(r.dailyHour) && r.dailyHour >= 0 && r.dailyHour <= 23 ? r.dailyHour : DEFAULT_ALERT_PREFS.dailyHour,
  };
}
