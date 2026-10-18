import { describe, expect, it } from "vitest";
import type { Customer } from "@/domain/clients/customer";
import type { OrderItemRecord, OrderRecord } from "@/domain/orders/order";
import type { PaymentRecord } from "@/domain/orders/payments";
import { buildDebtMessage, customerDebts, totalDebt } from "@/domain/orders/debts";

const NOW = "2026-10-18T09:00:00.000Z";
const order = (id: string, customer: string, total: number, over: Partial<OrderRecord> = {}): OrderRecord => ({
  id,
  tenant_id: "t",
  customer_id: customer,
  reference: `ORD-2026-00000${id}`,
  status: "SEWING",
  priority: "NORMAL",
  total_price: total,
  expected_at: null,
  delivered_at: null,
  employee_id: null,
  notes: null,
  created_by: null,
  created_at: NOW,
  updated_at: NOW,
  deleted_at: null,
  ...over,
});
const pay = (orderId: string, amount: number, status: PaymentRecord["status"] = "VALID"): PaymentRecord => ({
  id: `p-${orderId}-${amount}-${status}`,
  tenant_id: "t",
  order_id: orderId,
  amount,
  method: "CASH",
  status,
  idempotency_key: `k-${orderId}-${amount}`,
  recorded_by: null,
  note: null,
  cancelled_by: null,
  cancelled_at: null,
  cancellation_reason: null,
  created_at: NOW,
  updated_at: NOW,
});
const customer = (id: string, name: string, phone: string | null = null): Customer =>
  ({ id, full_name: name, phone, whatsapp: null }) as Customer;
const item = (orderId: string, description: string): OrderItemRecord =>
  ({ id: `i-${orderId}`, order_id: orderId, description, deleted_at: null }) as OrderItemRecord;

describe("soldes à encaisser", () => {
  const customers = [customer("awa", "Awa Diop", "+221 77 000 00 01"), customer("ous", "Ousmane Fall"), customer("mam", "Mame Ndiaye")];

  it("ne garde que ce qui reste à payer (paiements annulés ignorés, annulées et soldées exclues)", () => {
    const debts = customerDebts({
      orders: [
        order("1", "awa", 185000, { status: "READY_FOR_PICKUP" }),
        order("2", "awa", 25000, { status: "DELIVERED" }),
        order("3", "ous", 40000),
        order("4", "mam", 10000, { status: "CANCELLED" }),
        order("5", "mam", 5000),
        order("6", "ous", 9000, { deleted_at: NOW }),
      ],
      payments: [pay("1", 100000), pay("1", 50000, "CANCELLED"), pay("2", 25000), pay("3", 10000), pay("5", 5000)],
      customers,
    });
    expect(debts.map((d) => [d.customerId, d.totalDue])).toEqual([
      ["awa", 85000],
      ["ous", 30000],
    ]);
    expect(debts[0].orders.map((o) => o.order.id)).toEqual(["1"]);
    expect(totalDebt(debts)).toBe(115000);
  });

  it("habit prêt ou remis d'abord (argent dû maintenant), puis le plus gros montant", () => {
    const debts = customerDebts({
      orders: [order("1", "awa", 50000), order("2", "ous", 10000, { status: "DELIVERED" }), order("3", "mam", 90000)],
      payments: [],
      customers,
    });
    expect(debts.map((d) => d.customerId)).toEqual(["ous", "mam", "awa"]);
    expect(debts[0].dueNow).toBe(true);
    expect(debts[1].dueNow).toBe(false);
  });

  it("regroupe les commandes d'un même client et retrouve l'article", () => {
    const debts = customerDebts({
      orders: [order("1", "awa", 20000), order("2", "awa", 30000, { status: "READY_FOR_PICKUP" })],
      payments: [],
      customers,
      items: new Map([["2", [item("2", "Grand boubou")]]]),
    });
    expect(debts).toHaveLength(1);
    expect(debts[0].totalDue).toBe(50000);
    expect(debts[0].orders[0]).toMatchObject({ remaining: 30000, stage: "READY", article: "Grand boubou" });
  });
});

describe("message de relance", () => {
  const fmt = (n: number) => `${n} F CFA`;
  const base = { customerId: "awa", customerName: "Awa Diop", phone: null, whatsapp: null, since: "2026-10-01" };

  it("habit prêt : venir le chercher et régler le reste", () => {
    const text = buildDebtMessage({
      debt: { ...base, totalDue: 85000, dueNow: true, orders: [{ order: order("1", "awa", 185000), stage: "READY", remaining: 85000, article: "Grand boubou" }] },
      atelierName: "Top Couture",
      formatAmount: fmt,
    });
    expect(text).toBe("Bonjour Awa, bonne nouvelle : votre habit (Grand boubou) est prêt chez Top Couture ! Il reste 85000 F CFA à régler. Vous pouvez passer le récupérer quand vous voulez.\nMerci et à bientôt !\nTop Couture");
  });

  it("déjà remis : rappel poli ; en couture : reste à régler à la livraison", () => {
    const delivered = buildDebtMessage({
      debt: { ...base, totalDue: 5000, dueNow: true, orders: [{ order: order("1", "awa", 5000), stage: "DELIVERED", remaining: 5000, article: null }] },
      atelierName: "Top Couture",
      formatAmount: fmt,
    });
    expect(delivered).toContain("petit rappel de Top Couture : il reste 5000 F CFA à régler pour votre commande.");
    const sewing = buildDebtMessage({
      debt: { ...base, customerName: "Client", totalDue: 30000, dueNow: false, orders: [{ order: order("1", "awa", 30000), stage: "SEWING", remaining: 30000, article: null }] },
      atelierName: "Top Couture",
      formatAmount: fmt,
    });
    expect(sewing.startsWith("Bonjour, votre commande avance bien")).toBe(true);
    expect(sewing).toContain("Il restera 30000 F CFA à régler à la livraison.");
  });

  it("ne parle que de l'habit prêt quand un autre est encore en couture", () => {
    const text = buildDebtMessage({
      debt: {
        ...base,
        totalDue: 90000,
        dueNow: true,
        orders: [
          { order: order("1", "awa", 85000), stage: "READY", remaining: 60000, article: "Grand boubou" },
          { order: order("2", "awa", 30000), stage: "SEWING", remaining: 30000, article: "Robe wax" },
        ],
      },
      atelierName: "Top Couture",
      formatAmount: fmt,
    });
    expect(text).toContain("votre habit (Grand boubou) est prêt chez Top Couture ! Il reste 90000 F CFA à régler. Vous pouvez passer le récupérer");
    expect(text).not.toContain("Robe wax");
    const two = buildDebtMessage({
      debt: {
        ...base,
        totalDue: 50000,
        dueNow: true,
        orders: [
          { order: order("1", "awa", 25000), stage: "READY", remaining: 25000, article: "Grand boubou" },
          { order: order("2", "awa", 25000), stage: "READY", remaining: 25000, article: "Robe wax" },
        ],
      },
      atelierName: "Top Couture",
      formatAmount: fmt,
    });
    expect(two).toContain("vos habits (Grand boubou, Robe wax) sont prêts chez Top Couture ! Il reste 50000 F CFA à régler. Vous pouvez passer les récupérer");
  });
});
