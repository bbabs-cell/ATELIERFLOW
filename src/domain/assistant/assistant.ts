import { APPOINTMENT_TYPE_LABELS, type AppointmentRecord } from "@/domain/appointments/appointments";
import { relativeDayLabel, timeLabel } from "@/domain/appointments/messages";
import type { Customer } from "@/domain/clients/customer";
import { LOW_STOCK_THRESHOLD_CENTI } from "@/domain/dashboard/kpis";
import type { FabricRecord } from "@/domain/inventory/fabrics";
import { formatCentiUnits } from "@/domain/inventory/units";
import type { OrderPriority, OrderRecord, OrderStatus } from "@/domain/orders/order";
import type { PaymentRecord } from "@/domain/orders/payments";
import type { PermissionCode } from "@/domain/team/roles";
import { HELP_TOPICS, type HelpTopic } from "./help";
import { hasPhrase, isHowTo, normalizeText, phraseScore } from "./text";

/**
 * Assistant de l'atelier, 100 % local : il comprend des questions courantes
 * en français et répond à partir des données présentes sur l'appareil
 * (celles que le rôle de l'utilisateur permet de voir) ou du guide
 * d'utilisation. Aucune donnée n'est envoyée.
 */

export interface AssistantData {
  now: string;
  timeZone?: string;
  permissions: ReadonlySet<PermissionCode>;
  orders: readonly OrderRecord[];
  payments: readonly PaymentRecord[];
  customers: readonly Customer[];
  appointments: readonly AppointmentRecord[];
  fabrics: readonly FabricRecord[];
  money: (amount: number) => string;
  labels: { status: Record<OrderStatus, string>; priority: Record<OrderPriority, string> };
}

export interface AnswerItem {
  label: string;
  detail?: string;
  tone?: "danger" | "warning" | "success" | "neutral";
}

export interface AnswerBlock {
  title?: string;
  text?: string;
  items?: AnswerItem[];
  steps?: readonly string[];
  note?: string;
}

export interface AssistantAnswer {
  kind: "data" | "help" | "smalltalk" | "unknown";
  blocks: AnswerBlock[];
  links: { label: string; href: string }[];
  suggestions: string[];
}

export const ASSISTANT_STARTERS: readonly string[] = [
  "J'ai combien de commandes ?",
  "Quelles commandes sont les plus urgentes ?",
  "Qui me doit de l'argent ?",
  "Combien j'ai encaissé ce mois ?",
  "Mes rendez-vous de demain",
  "Comment faire un reçu ?",
  "Comment enregistrer les mesures ?",
  "Comment mettre ma photo de profil ?",
];

type DataIntent = "summary" | "orders" | "urgent" | "late" | "ready" | "outstanding" | "collected" | "appointments" | "customers" | "stock";

const DATA_INTENTS: Record<DataIntent, readonly string[]> = {
  summary: ["resume", "bilan du jour", "point du jour", "comment va l atelier", "quoi de neuf", "situation", "point sur l atelier"],
  orders: ["combien de commande", "nombre de commande", "mes commandes", "les commandes", "commandes en cours", "commande en cours", "commandes actives", "travail en cours", "commandes"],
  urgent: ["urgent", "urgence", "prioritaire", "priorite", "presse", "en premier", "d abord", "echeance", "date limite", "a faire aujourd hui", "a livrer bientot"],
  late: ["retard", "depasse"],
  ready: ["pret", "prete", "a retirer", "retrait", "a recuperer", "venir chercher", "a livrer"],
  outstanding: ["doit", "doivent", "dette", "impaye", "reste a payer", "reste a encaisser", "pas encore paye", "pas paye", "solde", "credit", "n ont pas paye", "qui doit"],
  collected: ["encaisse", "chiffre d affaire", "gagne", "recette", "combien d argent", "argent recu", "argent rentre", "rentre", "ventes", "benefice", "revenu"],
  appointments: ["rendez vous", "rdv", "essayage", "qui vient", "visite"],
  customers: ["combien de client", "nombre de client", "nouveaux clients", "nouveau client", "mes clients"],
  stock: ["stock", "tissu", "rupture", "reapprovision", "manque de"],
};

const DATA_ORDER: readonly DataIntent[] = ["summary", "orders", "urgent", "late", "ready", "outstanding", "collected", "appointments", "customers", "stock"];

const NEEDS: Record<DataIntent, PermissionCode> = {
  summary: "orders.read",
  orders: "orders.read",
  urgent: "orders.read",
  late: "orders.read",
  ready: "orders.read",
  outstanding: "payments.read",
  collected: "payments.read",
  appointments: "appointments.read",
  customers: "customers.read",
  stock: "stock.read",
};

const SMALLTALK = {
  hello: ["bonjour", "bonsoir", "salut", "hello", "coucou", "salam", "asalamalekum", "nanga def", "bjr", "slt"],
  thanks: ["merci", "super", "parfait", "genial", "cool", "ok merci", "jerejef"],
  who: ["qui es tu", "tu es qui", "tu fais quoi", "que sais tu faire", "aide", "help", "menu"],
};

const ACTIVE_EXCLUDED: ReadonlySet<OrderStatus> = new Set(["DELIVERED", "CANCELLED"]);

// ---------------------------------------------------------------------------
// Dates

function dayKey(iso: string, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function addDays(key: string, days: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / 86_400_000);
}

interface Period {
  label: string;
  from: string;
  to: string;
}

/** Période demandée (jours calendaires inclus) ; `fallback` si rien n'est précisé. */
export function parsePeriod(normalized: string, now: string, timeZone: string | undefined, fallback: "month" | "upcoming"): Period {
  const today = dayKey(now, timeZone);
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const monday = addDays(today, -((weekday + 6) % 7));
  const monthStart = `${today.slice(0, 8)}01`;
  const prevMonthStart = (() => {
    const d = new Date(`${monthStart}T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - 1);
    return d.toISOString().slice(0, 10);
  })();
  if (hasPhrase(normalized, "aujourd hui") || hasPhrase(normalized, "ce jour") || hasPhrase(normalized, "ce matin") || hasPhrase(normalized, "ce soir")) return { label: "aujourd'hui", from: today, to: today };
  if (hasPhrase(normalized, "apres demain")) return { label: "après-demain", from: addDays(today, 2), to: addDays(today, 2) };
  if (hasPhrase(normalized, "demain")) return { label: "demain", from: addDays(today, 1), to: addDays(today, 1) };
  if (hasPhrase(normalized, "hier")) return { label: "hier", from: addDays(today, -1), to: addDays(today, -1) };
  if (hasPhrase(normalized, "semaine derniere") || hasPhrase(normalized, "semaine passee")) return { label: "la semaine dernière", from: addDays(monday, -7), to: addDays(monday, -1) };
  if (hasPhrase(normalized, "semaine prochaine")) return { label: "la semaine prochaine", from: addDays(monday, 7), to: addDays(monday, 13) };
  if (hasPhrase(normalized, "semaine")) return { label: "cette semaine", from: monday, to: addDays(monday, 6) };
  if (hasPhrase(normalized, "mois dernier") || hasPhrase(normalized, "mois passe")) return { label: "le mois dernier", from: prevMonthStart, to: addDays(monthStart, -1) };
  if (hasPhrase(normalized, "annee") || hasPhrase(normalized, "an!")) return { label: "cette année", from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` };
  if (hasPhrase(normalized, "mois")) return { label: "ce mois-ci", from: monthStart, to: addDays(today, 0) };
  return fallback === "month"
    ? { label: "ce mois-ci", from: monthStart, to: today }
    : { label: "dans les 7 prochains jours", from: today, to: addDays(today, 6) };
}

// ---------------------------------------------------------------------------
// Calculs

function paidByOrder(payments: readonly PaymentRecord[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const p of payments) {
    if (p.status !== "VALID" || !Number.isSafeInteger(p.amount) || p.amount <= 0) continue;
    map.set(p.order_id, (map.get(p.order_id) ?? 0) + p.amount);
  }
  return map;
}

function activeOrders(data: AssistantData): OrderRecord[] {
  return data.orders.filter((o) => !o.deleted_at && !ACTIVE_EXCLUDED.has(o.status));
}

function customerName(data: AssistantData, id: string): string {
  return data.customers.find((c) => c.id === id)?.full_name ?? "Client";
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n > 1 ? many : one}`;
}

interface UrgencyInfo {
  order: OrderRecord;
  daysLeft: number | null;
  rank: number;
}

const PRIORITY_RANK: Record<OrderPriority, number> = { URGENT: 3, HIGH: 2, NORMAL: 1, LOW: 0 };

/** Commandes en cours classées : retard, puis échéance proche, puis priorité. */
export function rankUrgentOrders(data: AssistantData): UrgencyInfo[] {
  const today = dayKey(data.now, data.timeZone);
  return activeOrders(data)
    .map((order) => {
      const daysLeft = order.expected_at ? daysBetween(today, order.expected_at.slice(0, 10)) : null;
      // retard : 1000+ ; échéance ≤ 3 j : 500+ ; puis priorité.
      const rank =
        (daysLeft !== null && daysLeft < 0 ? 1000 - daysLeft : 0) +
        (daysLeft !== null && daysLeft >= 0 && daysLeft <= 3 ? 500 - daysLeft * 10 : 0) +
        PRIORITY_RANK[order.priority] * 20;
      return { order, daysLeft, rank };
    })
    .sort((a, b) => b.rank - a.rank || (a.order.expected_at ?? "9999").localeCompare(b.order.expected_at ?? "9999"));
}

function isUrgent(info: UrgencyInfo): boolean {
  return (info.daysLeft !== null && info.daysLeft <= 3) || info.order.priority === "URGENT" || info.order.priority === "HIGH";
}

function dueLabel(daysLeft: number | null): string | null {
  if (daysLeft === null) return null;
  if (daysLeft < 0) return `${-daysLeft} j de retard`;
  if (daysLeft === 0) return "à livrer aujourd'hui";
  if (daysLeft === 1) return "à livrer demain";
  return `à livrer dans ${daysLeft} j`;
}

function orderItem(data: AssistantData, info: UrgencyInfo): AnswerItem {
  const parts = [dueLabel(info.daysLeft), info.order.priority === "URGENT" || info.order.priority === "HIGH" ? data.labels.priority[info.order.priority] : null, data.labels.status[info.order.status]];
  return {
    label: `${info.order.reference} · ${customerName(data, info.order.customer_id)}`,
    detail: parts.filter(Boolean).join(" · "),
    tone: info.daysLeft !== null && info.daysLeft < 0 ? "danger" : info.daysLeft !== null && info.daysLeft <= 1 ? "warning" : "neutral",
  };
}

// ---------------------------------------------------------------------------
// Réponses « données »

function answerOrders(data: AssistantData): AnswerBlock {
  const active = activeOrders(data);
  if (active.length === 0) return { text: "Vous n'avez aucune commande en cours pour le moment." };
  const byStatus = new Map<OrderStatus, number>();
  for (const o of active) byStatus.set(o.status, (byStatus.get(o.status) ?? 0) + 1);
  const ranked = rankUrgentOrders(data);
  const late = ranked.filter((r) => r.daysLeft !== null && r.daysLeft < 0).length;
  const ready = active.filter((o) => o.status === "READY_FOR_PICKUP").length;
  const extra = [late ? plural(late, "en retard", "en retard") : null, ready ? plural(ready, "prête à retirer", "prêtes à retirer") : null].filter(Boolean);
  return {
    text: `Vous avez ${plural(active.length, "commande en cours", "commandes en cours")}${extra.length ? `, dont ${extra.join(" et ")}` : ""}.`,
    items: [...byStatus.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([status, count]) => ({ label: data.labels.status[status], detail: String(count) })),
  };
}

function answerUrgent(data: AssistantData): AnswerBlock {
  const urgent = rankUrgentOrders(data).filter(isUrgent);
  if (urgent.length === 0) return { title: "Les plus urgentes", text: "Rien d'urgent : aucune commande en retard, à livrer dans les 3 jours ou marquée prioritaire." };
  return {
    title: "Les plus urgentes",
    text: `${plural(urgent.length, "commande demande", "commandes demandent")} votre attention${urgent.length > 5 ? " (les 5 premières)" : ""} :`,
    items: urgent.slice(0, 5).map((info) => orderItem(data, info)),
  };
}

function answerLate(data: AssistantData): AnswerBlock {
  const late = rankUrgentOrders(data).filter((r) => r.daysLeft !== null && r.daysLeft < 0);
  if (late.length === 0) return { title: "En retard", text: "Aucune commande en retard. Bravo !" };
  return { title: "En retard", text: `${plural(late.length, "commande est", "commandes sont")} en retard :`, items: late.slice(0, 8).map((info) => orderItem(data, info)) };
}

function answerReady(data: AssistantData): AnswerBlock {
  const paid = paidByOrder(data.payments);
  const ready = activeOrders(data).filter((o) => o.status === "READY_FOR_PICKUP");
  if (ready.length === 0) return { title: "Prêtes à retirer", text: "Aucune commande n'attend son client pour le moment." };
  const showMoney = data.permissions.has("payments.read");
  return {
    title: "Prêtes à retirer",
    text: `${plural(ready.length, "commande attend", "commandes attendent")} d'être retirée${ready.length > 1 ? "s" : ""} :`,
    items: ready.slice(0, 8).map((o) => {
      const rest = Math.max(0, o.total_price - (paid.get(o.id) ?? 0));
      return {
        label: `${o.reference} · ${customerName(data, o.customer_id)}`,
        detail: showMoney ? (rest > 0 ? `reste ${data.money(rest)} à payer` : "entièrement payée") : undefined,
        tone: showMoney && rest > 0 ? "warning" : "success",
      };
    }),
  };
}

function answerOutstanding(data: AssistantData): AnswerBlock {
  const paid = paidByOrder(data.payments);
  const byCustomer = new Map<string, { amount: number; orders: number }>();
  let total = 0;
  for (const o of data.orders) {
    if (o.deleted_at || o.status === "CANCELLED") continue;
    const rest = o.total_price - (paid.get(o.id) ?? 0);
    if (rest <= 0) continue;
    total += rest;
    const c = byCustomer.get(o.customer_id) ?? { amount: 0, orders: 0 };
    c.amount += rest;
    c.orders += 1;
    byCustomer.set(o.customer_id, c);
  }
  if (total === 0) return { title: "Reste à encaisser", text: "Personne ne vous doit d'argent : toutes les commandes sont payées." };
  const top = [...byCustomer.entries()].sort((a, b) => b[1].amount - a[1].amount);
  return {
    title: "Reste à encaisser",
    text: `Vos clients vous doivent ${data.money(total)} au total (${plural(top.length, "client", "clients")}).${top.length > 5 ? " Les 5 plus gros montants :" : ""}`,
    items: top.slice(0, 5).map(([id, c]) => ({ label: customerName(data, id), detail: `${data.money(c.amount)} · ${plural(c.orders, "commande", "commandes")}`, tone: "warning" as const })),
  };
}

function answerCollected(data: AssistantData, normalized: string): AnswerBlock {
  const period = parsePeriod(normalized, data.now, data.timeZone, "month");
  let total = 0;
  let count = 0;
  for (const p of data.payments) {
    if (p.status !== "VALID") continue;
    const day = dayKey(p.created_at, data.timeZone);
    if (day < period.from || day > period.to) continue;
    total += p.amount;
    count += 1;
  }
  return {
    title: "Encaissé",
    text: count === 0 ? `Aucun paiement enregistré ${period.label}.` : `Vous avez encaissé ${data.money(total)} ${period.label} (${plural(count, "paiement", "paiements")}).`,
  };
}

function answerAppointments(data: AssistantData, normalized: string): AnswerBlock {
  const period = parsePeriod(normalized, data.now, data.timeZone, "upcoming");
  const list = data.appointments
    .filter((a) => !a.deleted_at && (a.status === "SCHEDULED" || a.status === "CONFIRMED"))
    .filter((a) => {
      const day = dayKey(a.starts_at, data.timeZone);
      return day >= period.from && day <= period.to;
    })
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  if (list.length === 0) return { title: "Rendez-vous", text: `Aucun rendez-vous ${period.label}.` };
  return {
    title: "Rendez-vous",
    text: `${plural(list.length, "rendez-vous", "rendez-vous")} ${period.label} :`,
    items: list.slice(0, 8).map((a) => ({
      label: `${customerName(data, a.customer_id)} · ${APPOINTMENT_TYPE_LABELS[a.type]}`,
      detail: `${relativeDayLabel(a.starts_at, data.now, data.timeZone)} à ${timeLabel(a.starts_at, data.timeZone)}`,
    })),
  };
}

function answerCustomers(data: AssistantData): AnswerBlock {
  const active = data.customers.filter((c) => !c.deleted_at && c.status === "ACTIVE");
  const monthStart = `${dayKey(data.now, data.timeZone).slice(0, 8)}01`;
  const fresh = active.filter((c) => dayKey(c.created_at, data.timeZone) >= monthStart).length;
  return { title: "Clients", text: `Vous avez ${plural(active.length, "client", "clients")}, dont ${plural(fresh, "nouveau", "nouveaux")} ce mois-ci.` };
}

function answerStock(data: AssistantData): AnswerBlock {
  const fabrics = data.fabrics.filter((f) => f.status === "ACTIVE");
  const low = fabrics.filter((f) => f.quantity <= LOW_STOCK_THRESHOLD_CENTI).sort((a, b) => a.quantity - b.quantity);
  if (fabrics.length === 0) return { title: "Stock", text: "Aucun tissu enregistré dans le stock." };
  if (low.length === 0) return { title: "Stock", text: `${plural(fabrics.length, "tissu", "tissus")} en stock, aucun en quantité basse.` };
  return {
    title: "Stock bas",
    text: `${plural(low.length, "tissu est", "tissus sont")} presque épuisé${low.length > 1 ? "s" : ""} :`,
    items: low.slice(0, 8).map((f) => ({ label: f.name, detail: `${formatCentiUnits(f.quantity)} ${f.unit}`, tone: f.quantity <= 0 ? ("danger" as const) : ("warning" as const) })),
  };
}

function answerSummary(data: AssistantData): AnswerBlock[] {
  const blocks = [answerOrders(data), answerUrgent(data)];
  if (data.permissions.has("appointments.read")) blocks.push(answerAppointments(data, "aujourd hui"));
  if (data.permissions.has("payments.read")) blocks.push(answerOutstanding(data));
  return blocks;
}

const LINKS: Record<DataIntent, { label: string; href: string }> = {
  summary: { label: "Tableau de bord", href: "/dashboard" },
  orders: { label: "Voir les commandes", href: "/commandes" },
  urgent: { label: "Voir les commandes", href: "/commandes" },
  late: { label: "Voir les commandes", href: "/commandes" },
  ready: { label: "Voir les commandes", href: "/commandes" },
  outstanding: { label: "Voir le rapport", href: "/rapports" },
  collected: { label: "Voir le rapport", href: "/rapports" },
  appointments: { label: "Voir les rendez-vous", href: "/rdv" },
  customers: { label: "Voir les clients", href: "/clients" },
  stock: { label: "Voir le stock", href: "/stock" },
};

const DENIED: Partial<Record<PermissionCode, string>> = {
  "payments.read": "Votre rôle ne permet pas de voir les montants payés ou dus. Demandez au propriétaire de l'atelier.",
  "appointments.read": "Votre rôle ne permet pas de voir les rendez-vous.",
  "customers.read": "Votre rôle ne permet pas de voir les clients.",
  "stock.read": "Votre rôle ne permet pas de voir le stock.",
  "orders.read": "Votre rôle ne permet pas de voir les commandes.",
};

function deniedText(permission: PermissionCode): string {
  return DENIED[permission] ?? "Votre rôle ne permet pas de voir cette information.";
}

// ---------------------------------------------------------------------------
// Recherche d'un client ou d'une commande nommés dans la question

const NAME_STOPWORDS = new Set(["les", "des", "mes", "une", "pour", "avec", "client", "cliente", "commande", "commandes", "combien", "quelles", "quels", "sont", "doit", "plus", "moins", "tout", "tous", "bien", "mois", "jour", "semaine", "demain", "hier", "argent", "paye", "payer", "reste", "urgent", "retard", "rendez", "vous"]);

export function findCustomerInQuestion(normalized: string, customers: readonly Customer[]): Customer | null {
  const words = new Set(normalized.split(" "));
  let best: { customer: Customer; score: number } | null = null;
  let tie = false;
  for (const c of customers) {
    if (c.deleted_at) continue;
    const name = normalizeText(c.full_name);
    if (!name) continue;
    let score = 0;
    if (hasPhrase(normalized, `${name}!`)) score = 100 + name.length;
    else {
      const tokens = name.split(" ").filter((t) => t.length >= 3 && !NAME_STOPWORDS.has(t));
      const matched = tokens.filter((t) => words.has(t));
      if (matched.length > 0) score = matched.length * 10 + matched.join("").length;
    }
    if (score === 0) continue;
    if (!best || score > best.score) {
      best = { customer: c, score };
      tie = false;
    } else if (score === best.score) tie = true;
  }
  return best && !tie ? best.customer : null;
}

function answerCustomer(data: AssistantData, customer: Customer): AnswerBlock {
  const paid = paidByOrder(data.payments);
  const today = dayKey(data.now, data.timeZone);
  const orders = data.orders.filter((o) => o.customer_id === customer.id && !o.deleted_at && o.status !== "CANCELLED");
  const active = orders.filter((o) => o.status !== "DELIVERED");
  const showMoney = data.permissions.has("payments.read");
  const owed = orders.reduce((sum, o) => sum + Math.max(0, o.total_price - (paid.get(o.id) ?? 0)), 0);
  const next = data.permissions.has("appointments.read")
    ? data.appointments
        .filter((a) => a.customer_id === customer.id && !a.deleted_at && (a.status === "SCHEDULED" || a.status === "CONFIRMED") && dayKey(a.starts_at, data.timeZone) >= today)
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0]
    : undefined;
  const sentences = [
    active.length ? `${customer.full_name} a ${plural(active.length, "commande en cours", "commandes en cours")}.` : `${customer.full_name} n'a aucune commande en cours.`,
    showMoney ? (owed > 0 ? `Reste à payer : ${data.money(owed)}.` : "Tout est payé.") : null,
    next ? `Prochain rendez-vous : ${relativeDayLabel(next.starts_at, data.now, data.timeZone)} à ${timeLabel(next.starts_at, data.timeZone)} (${APPOINTMENT_TYPE_LABELS[next.type].toLowerCase()}).` : null,
  ];
  return {
    title: customer.full_name,
    text: sentences.filter(Boolean).join(" "),
    items: active.slice(0, 6).map((o) => {
      const rest = Math.max(0, o.total_price - (paid.get(o.id) ?? 0));
      const due = o.expected_at ? dueLabel(daysBetween(today, o.expected_at.slice(0, 10))) : null;
      return {
        label: o.reference,
        detail: [data.labels.status[o.status], due, showMoney && rest > 0 ? `reste ${data.money(rest)}` : null].filter(Boolean).join(" · "),
      };
    }),
  };
}

const ORDER_REF_RE = /\bord\s?(\d{4})\s?(\d{6})\b/;

function answerOrderReference(data: AssistantData, normalized: string): AnswerBlock | null {
  const m = ORDER_REF_RE.exec(normalized);
  if (!m) return null;
  const reference = `ORD-${m[1]}-${m[2]}`;
  const order = data.orders.find((o) => o.reference === reference);
  if (!order) return { text: `Je ne trouve pas la commande ${reference} sur cet appareil.` };
  const paid = paidByOrder(data.payments).get(order.id) ?? 0;
  const today = dayKey(data.now, data.timeZone);
  const due = order.expected_at && !ACTIVE_EXCLUDED.has(order.status) ? dueLabel(daysBetween(today, order.expected_at.slice(0, 10))) : null;
  const showMoney = data.permissions.has("payments.read");
  return {
    title: reference,
    text: [
      `Commande de ${customerName(data, order.customer_id)}, étape « ${data.labels.status[order.status]} »${due ? `, ${due}` : ""}.`,
      showMoney ? `Total ${data.money(order.total_price)}, payé ${data.money(paid)}, reste ${data.money(Math.max(0, order.total_price - paid))}.` : null,
    ]
      .filter(Boolean)
      .join(" "),
  };
}

// ---------------------------------------------------------------------------
// Aide

export function bestHelpTopics(normalized: string): { topic: HelpTopic; score: number }[] {
  return HELP_TOPICS.map((topic) => ({ topic, score: phraseScore(normalized, topic.keywords) }))
    .filter((t) => t.score > 0)
    .sort((a, b) => b.score - a.score);
}

function helpAnswer(topic: HelpTopic, others: HelpTopic[]): AssistantAnswer {
  return {
    kind: "help",
    blocks: [{ title: topic.title, steps: topic.steps, note: topic.note }],
    links: topic.link ? [topic.link] : [],
    suggestions: others.slice(0, 2).map((t) => `Comment : ${t.title.toLowerCase()} ?`),
  };
}

// ---------------------------------------------------------------------------
// Point d'entrée

export function answerQuestion(question: string, data: AssistantData): AssistantAnswer {
  const n = normalizeText(question.slice(0, 500));
  if (!n) return welcome();

  const words = n.split(" ").length;
  if (words <= 4 && phraseScore(n, SMALLTALK.thanks) > 0) {
    return { kind: "smalltalk", blocks: [{ text: "Avec plaisir ! Autre chose ?" }], links: [], suggestions: ASSISTANT_STARTERS.slice(0, 3) as string[] };
  }
  if (phraseScore(n, SMALLTALK.who) > 0 && words <= 6) return welcome();
  const greetingOnly = words <= 3 && phraseScore(n, SMALLTALK.hello) > 0;
  if (greetingOnly) return welcome("Bonjour ! ");

  const howTo = isHowTo(n);
  const help = bestHelpTopics(n);

  if (!howTo) {
    const reference = answerOrderReference(data, n);
    if (reference) return { kind: "data", blocks: [reference], links: [LINKS.orders], suggestions: [] };
  }

  if (howTo && help.length > 0) return helpAnswer(help[0].topic, help.slice(1).map((h) => h.topic));

  const intents = DATA_ORDER.filter((intent) => phraseScore(n, DATA_INTENTS[intent]) > 0);
  const customer = !howTo && data.permissions.has("customers.read") ? findCustomerInQuestion(n, data.customers) : null;

  if (customer && data.permissions.has("orders.read")) {
    return { kind: "data", blocks: [answerCustomer(data, customer)], links: [{ label: "Voir les clients", href: "/clients" }], suggestions: [] };
  }

  if (intents.length > 0) {
    // « urgent » englobe « en retard » ; « résumé » englobe tout.
    const chosen = intents.includes("summary") ? (["summary"] as DataIntent[]) : intents.filter((i) => !(i === "late" && intents.includes("urgent"))).slice(0, 3);
    const blocks: AnswerBlock[] = [];
    for (const intent of chosen) {
      if (!data.permissions.has(NEEDS[intent])) {
        blocks.push({ text: deniedText(NEEDS[intent]) });
        continue;
      }
      switch (intent) {
        case "summary":
          blocks.push(...answerSummary(data));
          break;
        case "orders":
          blocks.push(answerOrders(data));
          break;
        case "urgent":
          blocks.push(answerUrgent(data));
          break;
        case "late":
          blocks.push(answerLate(data));
          break;
        case "ready":
          blocks.push(answerReady(data));
          break;
        case "outstanding":
          blocks.push(answerOutstanding(data));
          break;
        case "collected":
          blocks.push(answerCollected(data, n));
          break;
        case "appointments":
          blocks.push(answerAppointments(data, n));
          break;
        case "customers":
          blocks.push(answerCustomers(data));
          break;
        case "stock":
          blocks.push(answerStock(data));
          break;
      }
    }
    const links = [...new Map(chosen.map((i) => [LINKS[i].href, LINKS[i]])).values()];
    return { kind: "data", blocks, links, suggestions: [] };
  }

  if (help.length > 0) return helpAnswer(help[0].topic, help.slice(1).map((h) => h.topic));

  return {
    kind: "unknown",
    blocks: [
      {
        text: "Je n'ai pas compris cette question. Je sais répondre sur vos commandes, paiements, clients, rendez-vous et stock, et expliquer comment utiliser l'application. Essayez par exemple :",
      },
    ],
    links: [],
    suggestions: ASSISTANT_STARTERS.slice(0, 4) as string[],
  };
}

function welcome(prefix = ""): AssistantAnswer {
  return {
    kind: "smalltalk",
    blocks: [
      {
        text: `${prefix}Je suis l'assistant de votre atelier. Je réponds à partir des données de cet appareil (rien n'est envoyé ailleurs) et je vous explique comment utiliser l'application. Posez votre question ou choisissez :`,
      },
    ],
    links: [],
    suggestions: [...ASSISTANT_STARTERS],
  };
}
