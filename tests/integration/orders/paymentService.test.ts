import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { createClientsService } from "@/application/clients/clientService";
import { createOrderService } from "@/application/orders/orderService";
import { createPaymentService } from "@/application/orders/paymentService";
import { SyncEngine } from "@/application/sync/engine";
import { createIndexedDbCache } from "@/repository/local/indexeddb/cache";
import { createIndexedDbQueue } from "@/repository/local/indexeddb/queue";
import { makeLocalClientsStores } from "@/repository/local/clients";
import { makeLocalOrderStores } from "@/repository/local/orders";
import { makeLocalPaymentsRepository } from "@/repository/local/payments";
import { createFakeSyncServer } from "../../support/fakeSyncServer";
import { parseFcfa } from "@/domain/money";

let tenantSeq = 0;
const uniqueTenant = () =>
  `00000000-0000-4000-8000-00000000${(tenantSeq += 1).toString(16).padStart(8, "0")}`;

function makeHarness(tenantId: string = uniqueTenant()) {
  const queue = createIndexedDbQueue(tenantId);
  const cache = createIndexedDbCache(tenantId);
  const server = createFakeSyncServer();
  const clientStores = makeLocalClientsStores(cache);
  const orderStores = makeLocalOrderStores(cache);
  let t = 1_767_225_599_000;
  const now = () => new Date((t += 1_000)).toISOString();
  let n = 0;
  const uuid = () => `20000000-0000-4000-8000-${(n += 1).toString(16).padStart(12, "0")}`;
  const engine = new SyncEngine({
    queue,
    cache,
    remote: server,
    now: () => t,
    uuid: () => `30000000-0000-4000-8000-${(n += 1).toString(16).padStart(12, "0")}`,
  });
  const clients = createClientsService({
    tenantId,
    profileId: "p-owner",
    customers: clientStores.customers,
    profiles: clientStores.profiles,
    snapshots: clientStores.snapshots,
    engine,
    now,
    uuid,
  });
  const orders = createOrderService({
    tenantId,
    profileId: "p-owner",
    orders: orderStores.orders,
    items: orderStores.items,
    history: orderStores.history,
    customers: clientStores.customers,
    engine,
    now,
    uuid,
  });
  const payments = createPaymentService({
    tenantId,
    profileId: "p-owner",
    orders: orderStores.orders,
    payments: makeLocalPaymentsRepository(cache),
    engine,
    now,
    uuid,
  });
  return { cache, server, engine, clients, orders, payments };
}

async function createOrder(tenant: ReturnType<typeof makeHarness>) {
  const customer = await tenant.clients.createCustomer({
    full_name: "Awa Diop",
    phone: "771234567",
  });
  if (!customer.ok) return null;
  const created = await tenant.orders.createOrder({
    customerId: customer.customer.id,
    priority: "NORMAL",
    items: [{ description: "Robe de mariée", quantity: 1, unit_price: 50000 }],
  });
  return created.ok ? created.order : null;
}

describe("createPaymentService", () => {
  it("scénario canonique : paiements successifs, surplus, annulation du dernier", async () => {
    const h = makeHarness();
    const order = await createOrder(h);
    if (!order) return;

    const first = await h.payments.recordPayment({
      orderId: order.id,
      amount: 20000,
      method: "CASH",
    });
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.balance.remaining).toBe(30000);
      expect(first.balance.surplus).toBe(0);
    }

    const second = await h.payments.recordPayment({
      orderId: order.id,
      amount: 15000,
      method: "WAVE",
    });
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.balance.remaining).toBe(15000);

    const third = await h.payments.recordPayment({
      orderId: order.id,
      amount: 20000,
      method: "TRANSFER",
    });
    expect(third.ok).toBe(true);
    if (third.ok) {
      expect(third.balance.totalPaid).toBe(55000);
      expect(third.balance.surplus).toBe(5000);
      expect(third.balance.remaining).toBe(0);
    }

    if (!(first.ok && third.ok)) return;
    const cancelled = await h.payments.cancelPayment(
      third.payment.id,
      "Remboursement du trop-perçu",
    );
    expect(cancelled.ok).toBe(true);
    if (!cancelled.ok) return;
    expect(cancelled.payment.status).toBe("CANCELLED");
    expect(cancelled.payment.cancelled_at).not.toBeNull();
    expect(cancelled.balance.totalPaid).toBe(35000);
    expect(cancelled.balance.remaining).toBe(15000);
    expect(cancelled.balance.surplus).toBe(0);
  });

  it("exige une raison pour annuler et refuse le double annulation", async () => {
    const h = makeHarness();
    const order = await createOrder(h);
    if (!order) return;
    const rec = await h.payments.recordPayment({
      orderId: order.id,
      amount: 10000,
      method: "CASH",
    });
    if (!rec.ok) return;

    const noReason = await h.payments.cancelPayment(rec.payment.id, "  ");
    expect(noReason.ok).toBe(false);

    const done = await h.payments.cancelPayment(rec.payment.id, "Erreur de saisi");
    expect(done.ok).toBe(true);
    const again = await h.payments.cancelPayment(rec.payment.id, "Toujours");
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toContain("déjà annulé");
  });

  it("refuse d'encaisser un montant non valide ou une commande annulée", async () => {
    const h = makeHarness();
    const order = await createOrder(h);
    if (!order) return;

    const invalid = await h.payments.recordPayment({
      orderId: order.id,
      amount: 0,
      method: "CASH",
    });
    expect(invalid.ok).toBe(false);

    const cancelled = await h.orders.cancel(order.id, "Client a renoncé");
    expect(cancelled.ok).toBe(true);
    const blocked = await h.payments.recordPayment({
      orderId: order.id,
      amount: 1000,
      method: "CASH",
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.errors.generic).toContain("annulée");
  });

  it("calcule le solde depuis l'historique des paiements de la commande", async () => {
    const h = makeHarness();
    const order = await createOrder(h);
    if (!order) return;
    await h.payments.recordPayment({
      orderId: order.id,
      amount: 30000,
      method: "ORANGE_MONEY",
      note: "Acompte à la commande",
    });

    const sheet = await h.payments.orderPayments(order.id);
    expect(sheet).not.toBeNull();
    if (!sheet) return;
    expect(sheet.order.reference).toBe(order.reference);
    expect(sheet.payments).toHaveLength(1);
    expect(sheet.payments[0].idempotency_key).toMatch(/^[0-9a-f-]{36}$/i);
    expect(sheet.balance.remaining).toBe(20000);

    expect(await h.payments.orderPayments("inexistante")).toBeNull();
  });

  it("synchronise paiements et annulations de façon idempotente", async () => {
    const h = makeHarness();
    const order = await createOrder(h);
    if (!order) return;
    await h.payments.recordPayment({ orderId: order.id, amount: 20000, method: "CASH" });
    const rec2 = await h.payments.recordPayment({
      orderId: order.id,
      amount: 15000,
      method: "WAVE",
    });
    if (!rec2.ok) return;
    await h.payments.cancelPayment(rec2.payment.id, "Annulé par erreur");

    const report = await h.engine.flush();
    const pushed = h.server.pushed();
    expect(pushed.filter((op) => op.entity === "payments")).toHaveLength(3);
    expect(report.networkError).toBeNull();

    expect(await h.engine.flush()).toMatchObject({ synced: 0, attempted: 0 });

    const opKeys = pushed.map((op) => op.idempotencyKey);
    expect(new Set(opKeys).size).toBe(opKeys.length);

    const cancelled = pushed.find(
      (op) =>
        op.entity === "payments" &&
        op.operation === "UPDATE" &&
        (op.payload as { status: string }).status === "CANCELLED",
    );
    expect(cancelled).toBeDefined();
  });

  it("F CFA entiers de la saisie à la synchronisation (aucune conversion)", async () => {
    const h = makeHarness();
    const customer = await h.clients.createCustomer({ full_name: "Fatou Sow", phone: "770000000" });
    if (!customer.ok) throw new Error("client");
    const unitPrice = parseFcfa("50 000");
    const amount = parseFcfa("20 000");
    expect(unitPrice).toBe(50000);
    expect(amount).toBe(20000);

    const order = await h.orders.createOrder({
      customerId: customer.customer.id,
      priority: "NORMAL",
      items: [{ description: "Grand boubou", quantity: 1, unit_price: unitPrice ?? 0 }],
    });
    if (!order.ok) throw new Error("commande");
    const paid = await h.payments.recordPayment({ orderId: order.order.id, amount: amount ?? 0, method: "WAVE" });
    if (!paid.ok) throw new Error("paiement");
    expect(paid.balance.remaining).toBe(30000);

    await h.engine.flush();
    const wire = h.server.pushed();
    const orderOp = wire.find((op) => op.entity === "orders");
    const paymentOp = wire.find((op) => op.entity === "payments");
    expect((orderOp?.payload as { total_price?: number }).total_price).toBe(50000);
    expect((paymentOp?.payload as { amount?: number }).amount).toBe(20000);
  });
});