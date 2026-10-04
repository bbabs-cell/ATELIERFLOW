import type { Customer } from "@/domain/clients/customer";
import type { OrderRecord } from "@/domain/orders/order";
import type { PaymentMethod, PaymentRecord } from "@/domain/orders/payments";

/**
 * Rapport mensuel : calculé sur l'appareil à partir des données de
 * l'atelier (aucun envoi au serveur). Les montants sont des entiers dans la
 * monnaie de l'atelier.
 */

/** Mois « AAAA-MM ». */
export type MonthKey = string;

export const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Mois calendaire d'un instant dans un fuseau (celui de l'appareil par défaut). */
export function monthKeyOf(iso: string, timeZone?: string): MonthKey {
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", timeZone }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}`;
}

/** Jour (1-31) d'un instant dans un fuseau. */
function dayOf(iso: string, timeZone?: string): number {
  return Number(new Intl.DateTimeFormat("en-CA", { day: "numeric", timeZone }).format(new Date(iso)));
}

export function shiftMonth(month: MonthKey, delta: number): MonthKey {
  const [y, m] = month.split("-").map(Number);
  const index = y * 12 + (m - 1) + delta;
  const year = Math.floor(index / 12);
  const mon = (index % 12) + 1;
  return `${year}-${String(mon).padStart(2, "0")}`;
}

export function daysInMonth(month: MonthKey): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** « octobre 2026 ». */
export function monthLabel(month: MonthKey): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 15)));
}

/** Les `count` derniers mois, du plus récent au plus ancien. */
export function recentMonths(current: MonthKey, count = 12): MonthKey[] {
  return Array.from({ length: count }, (_, i) => shiftMonth(current, -i));
}

export interface ReportCustomerLine {
  customerId: string;
  name: string;
  amount: number;
  payments: number;
}

export interface ReportMethodLine {
  method: PaymentMethod;
  amount: number;
  count: number;
}

export interface ReportPaymentRow {
  date: string;
  orderReference: string;
  customerName: string;
  method: PaymentMethod;
  amount: number;
  cancelled: boolean;
}

export interface MonthlyReport {
  month: MonthKey;
  /** Encaissé (paiements valides du mois). */
  collected: number;
  paymentsCount: number;
  /** Encaissé le mois précédent, pour comparer. */
  previousCollected: number;
  /** Total des commandes créées dans le mois (hors annulées). */
  invoiced: number;
  ordersCreated: number;
  ordersDelivered: number;
  ordersCancelled: number;
  /** Reste à encaisser sur les commandes créées dans le mois. */
  outstandingFromMonth: number;
  /** Reste à encaisser aujourd'hui, toutes commandes confondues. */
  outstandingToday: number;
  newCustomers: number;
  /** Encaissé par jour (index 0 = le 1er). */
  daily: number[];
  byMethod: ReportMethodLine[];
  topCustomers: ReportCustomerLine[];
  payments: ReportPaymentRow[];
}

export interface MonthlyReportInput {
  month: MonthKey;
  orders: readonly OrderRecord[];
  payments: readonly PaymentRecord[];
  customers: readonly Customer[];
  timeZone?: string;
  topCount?: number;
}

export function buildMonthlyReport(input: MonthlyReportInput): MonthlyReport {
  const { month, timeZone } = input;
  const previous = shiftMonth(month, -1);
  const ordersById = new Map(input.orders.map((o) => [o.id, o]));
  const customersById = new Map(input.customers.map((c) => [c.id, c]));
  const customerName = (id: string | undefined) => (id ? customersById.get(id)?.full_name : undefined) ?? "Client";

  const paidByOrder = new Map<string, number>();
  const daily = Array.from({ length: daysInMonth(month) }, () => 0);
  const methods = new Map<PaymentMethod, ReportMethodLine>();
  const customers = new Map<string, ReportCustomerLine>();
  const rows: ReportPaymentRow[] = [];
  let collected = 0;
  let paymentsCount = 0;
  let previousCollected = 0;

  for (const p of input.payments) {
    const valid = p.status === "VALID" && Number.isSafeInteger(p.amount) && p.amount > 0;
    if (valid) paidByOrder.set(p.order_id, (paidByOrder.get(p.order_id) ?? 0) + p.amount);
    const key = monthKeyOf(p.created_at, timeZone);
    if (key === previous && valid) previousCollected += p.amount;
    if (key !== month) continue;
    const order = ordersById.get(p.order_id);
    rows.push({
      date: p.created_at,
      orderReference: order?.reference ?? "—",
      customerName: customerName(order?.customer_id),
      method: p.method,
      amount: p.amount,
      cancelled: !valid,
    });
    if (!valid) continue;
    collected += p.amount;
    paymentsCount += 1;
    daily[dayOf(p.created_at, timeZone) - 1] += p.amount;
    const m = methods.get(p.method) ?? { method: p.method, amount: 0, count: 0 };
    m.amount += p.amount;
    m.count += 1;
    methods.set(p.method, m);
    if (order) {
      const c = customers.get(order.customer_id) ?? { customerId: order.customer_id, name: customerName(order.customer_id), amount: 0, payments: 0 };
      c.amount += p.amount;
      c.payments += 1;
      customers.set(order.customer_id, c);
    }
  }

  let invoiced = 0;
  let ordersCreated = 0;
  let ordersDelivered = 0;
  let ordersCancelled = 0;
  let outstandingFromMonth = 0;
  let outstandingToday = 0;
  for (const o of input.orders) {
    if (o.deleted_at) continue;
    const balance = Math.max(0, o.total_price - (paidByOrder.get(o.id) ?? 0));
    const createdThisMonth = monthKeyOf(o.created_at, timeZone) === month;
    if (o.status === "CANCELLED") {
      if (createdThisMonth) ordersCancelled += 1;
      continue;
    }
    outstandingToday += balance;
    if (createdThisMonth) {
      ordersCreated += 1;
      invoiced += o.total_price;
      outstandingFromMonth += balance;
    }
    if (o.status === "DELIVERED" && o.delivered_at && monthKeyOf(o.delivered_at, timeZone) === month) ordersDelivered += 1;
  }

  const newCustomers = input.customers.filter((c) => !c.deleted_at && monthKeyOf(c.created_at, timeZone) === month).length;

  return {
    month,
    collected,
    paymentsCount,
    previousCollected,
    invoiced,
    ordersCreated,
    ordersDelivered,
    ordersCancelled,
    outstandingFromMonth,
    outstandingToday,
    newCustomers,
    daily,
    byMethod: [...methods.values()].sort((a, b) => b.amount - a.amount),
    topCustomers: [...customers.values()].sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name)).slice(0, input.topCount ?? 5),
    payments: rows.sort((a, b) => a.date.localeCompare(b.date)),
  };
}

/** Évolution en % par rapport au mois précédent ; null s'il n'y a pas de base. */
export function evolutionPercent(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** Cellule CSV : point-virgule (Excel en français), guillemets doublés, pas de formule. */
function cell(value: string | number): string {
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text) && typeof value === "string") text = `'${text}`;
  return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvLine(values: (string | number)[]): string {
  return values.map(cell).join(";");
}

/**
 * Export CSV ouvrable dans Excel (BOM UTF-8, séparateur « ; ») : résumé du
 * mois puis détail des paiements.
 */
export function monthlyReportCsv(
  report: MonthlyReport,
  options: { atelierName: string; currency: string; methodLabel: (m: PaymentMethod) => string; timeZone?: string },
): string {
  const date = (iso: string) =>
    new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: options.timeZone }).format(new Date(iso));
  const lines = [
    csvLine([`Rapport ${monthLabel(report.month)}`, options.atelierName]),
    csvLine([`Montants en ${options.currency}`]),
    "",
    csvLine(["Encaissé", report.collected]),
    csvLine(["Nombre de paiements", report.paymentsCount]),
    csvLine(["Encaissé le mois précédent", report.previousCollected]),
    csvLine(["Facturé (commandes du mois)", report.invoiced]),
    csvLine(["Commandes créées", report.ordersCreated]),
    csvLine(["Commandes livrées", report.ordersDelivered]),
    csvLine(["Commandes annulées", report.ordersCancelled]),
    csvLine(["Reste à encaisser (commandes du mois)", report.outstandingFromMonth]),
    csvLine(["Reste à encaisser aujourd'hui (toutes commandes)", report.outstandingToday]),
    csvLine(["Nouveaux clients", report.newCustomers]),
    "",
    csvLine(["Moyen de paiement", "Montant", "Nombre"]),
    ...report.byMethod.map((m) => csvLine([options.methodLabel(m.method), m.amount, m.count])),
    "",
    csvLine(["Meilleurs clients", "Montant payé", "Paiements"]),
    ...report.topCustomers.map((c) => csvLine([c.name, c.amount, c.payments])),
    "",
    csvLine(["Date", "Commande", "Client", "Moyen", "Montant", "État"]),
    ...report.payments.map((p) => csvLine([date(p.date), p.orderReference, p.customerName, options.methodLabel(p.method), p.amount, p.cancelled ? "Annulé" : "Valide"])),
  ];
  return `﻿${lines.join("\r\n")}\r\n`;
}

export function monthlyReportFileName(month: MonthKey): string {
  return `rapport-${month}.csv`;
}
