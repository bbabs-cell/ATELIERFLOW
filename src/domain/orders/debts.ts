import type { Customer } from "@/domain/clients/customer";
import type { OrderItemRecord, OrderRecord } from "./order";
import { paymentBalance, type PaymentRecord } from "./payments";
import { stageOf, type OrderStage } from "./stages";

/**
 * Soldes à encaisser, client par client — calculés sur l'appareil à partir des
 * commandes et des paiements déjà synchronisés (aucune table, aucune
 * migration). Une commande compte si elle n'est ni annulée ni supprimée et
 * qu'il reste de l'argent à payer.
 *
 * Ordre : d'abord les clients dont l'habit est prêt ou déjà remis (l'argent
 * est dû maintenant), puis le plus gros montant, puis la dette la plus
 * ancienne.
 */

export interface DebtOrder {
  order: OrderRecord;
  stage: OrderStage;
  remaining: number;
  /** Premier article (« Grand boubou bazin »), pour reconnaître la commande. */
  article: string | null;
}

export interface CustomerDebt {
  customerId: string;
  customerName: string;
  phone: string | null;
  whatsapp: string | null;
  totalDue: number;
  orders: DebtOrder[];
  /** Un habit est prêt ou déjà remis : l'argent est dû maintenant. */
  dueNow: boolean;
  /** Date la plus ancienne (livraison prévue, sinon création) parmi les commandes dues. */
  since: string;
}

export function customerDebts(input: {
  orders: readonly OrderRecord[];
  payments: readonly PaymentRecord[];
  customers: readonly Customer[];
  items?: ReadonlyMap<string, readonly OrderItemRecord[]>;
}): CustomerDebt[] {
  const paymentsByOrder = new Map<string, PaymentRecord[]>();
  for (const p of input.payments) {
    const list = paymentsByOrder.get(p.order_id);
    if (list) list.push(p);
    else paymentsByOrder.set(p.order_id, [p]);
  }
  const customers = new Map(input.customers.map((c) => [c.id, c]));
  const byCustomer = new Map<string, DebtOrder[]>();

  for (const order of input.orders) {
    if (order.deleted_at !== null) continue;
    const stage = stageOf(order.status);
    if (stage === null) continue;
    const { remaining } = paymentBalance(order.total_price, paymentsByOrder.get(order.id) ?? []);
    if (remaining <= 0) continue;
    const firstItem = input.items?.get(order.id)?.find((i) => i.deleted_at === null) ?? null;
    const entry: DebtOrder = { order, stage, remaining, article: firstItem?.description ?? null };
    const list = byCustomer.get(order.customer_id);
    if (list) list.push(entry);
    else byCustomer.set(order.customer_id, [entry]);
  }

  const debts: CustomerDebt[] = [];
  for (const [customerId, orders] of byCustomer) {
    const customer = customers.get(customerId);
    orders.sort((a, b) => b.remaining - a.remaining);
    const since = orders
      .map((o) => (o.order.expected_at ?? o.order.created_at).slice(0, 10))
      .sort()[0];
    debts.push({
      customerId,
      customerName: customer?.full_name ?? "Client",
      phone: customer?.phone ?? null,
      whatsapp: customer?.whatsapp ?? null,
      totalDue: orders.reduce((sum, o) => sum + o.remaining, 0),
      orders,
      dueNow: orders.some((o) => o.stage === "READY" || o.stage === "DELIVERED"),
      since,
    });
  }

  return debts.sort((a, b) => {
    if (a.dueNow !== b.dueNow) return a.dueNow ? -1 : 1;
    if (a.totalDue !== b.totalDue) return b.totalDue - a.totalDue;
    return a.since < b.since ? -1 : a.since > b.since ? 1 : 0;
  });
}

export function totalDebt(debts: readonly CustomerDebt[]): number {
  return debts.reduce((sum, d) => sum + d.totalDue, 0);
}

export interface DebtMessageInput {
  debt: CustomerDebt;
  atelierName: string;
  /** Montant mis en forme dans la monnaie de l'atelier (« 85 000 F CFA »). */
  formatAmount: (amount: number) => string;
}

function firstName(name: string): string | null {
  const first = name.trim().split(/\s+/)[0];
  return first && first !== "Client" ? first : null;
}

/** « (Grand boubou) », « (Grand boubou, Robe wax) », « (3 commandes) » ou rien. */
function articlesOf(orders: readonly DebtOrder[]): string {
  const names = orders.map((o) => o.article).filter((a): a is string => Boolean(a));
  if (names.length === 0) return "";
  if (orders.length > 2) return ` (${orders.length} commandes)`;
  return ` (${names.join(", ")})`;
}

/**
 * Message de relance WhatsApp, poli et court, adapté à la situation :
 * habit prêt (venir le chercher et régler), déjà remis (rappel du reste),
 * encore en couture (reste à régler à la livraison). La phrase ne parle que
 * des commandes concernées (un habit prêt n'est pas confondu avec celui
 * encore en couture) ; le montant est tout ce qui reste à payer. Relu et
 * modifiable avant l'envoi.
 */
export function buildDebtMessage({ debt, atelierName, formatAmount }: DebtMessageInput): string {
  const name = firstName(debt.customerName);
  const hello = name ? `Bonjour ${name},` : "Bonjour,";
  const amount = formatAmount(debt.totalDue);
  const ready = debt.orders.filter((o) => o.stage === "READY");
  const delivered = debt.orders.filter((o) => o.stage === "DELIVERED");

  let body: string;
  if (ready.length > 0) {
    const habit = ready.length > 1 ? `vos habits${articlesOf(ready)} sont prêts` : `votre habit${articlesOf(ready)} est prêt`;
    body = `bonne nouvelle : ${habit} chez ${atelierName} ! Il reste ${amount} à régler. Vous pouvez passer ${ready.length > 1 ? "les" : "le"} récupérer quand vous voulez.`;
  } else if (delivered.length > 0) {
    const commande = delivered.length > 1 ? `vos commandes${articlesOf(delivered)}` : `votre commande${articlesOf(delivered)}`;
    body = `petit rappel de ${atelierName} : il reste ${amount} à régler pour ${commande}. Merci de passer ou de nous envoyer le paiement quand vous pourrez.`;
  } else {
    const commande = debt.orders.length > 1 ? `vos commandes${articlesOf(debt.orders)} avancent` : `votre commande${articlesOf(debt.orders)} avance`;
    body = `${commande} bien chez ${atelierName}. Il restera ${amount} à régler à la livraison.`;
  }
  return `${hello} ${body}\nMerci et à bientôt !\n${atelierName}`;
}
