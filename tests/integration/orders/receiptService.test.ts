import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { createClientsService } from "@/application/clients/clientService";
import { createOrderService } from "@/application/orders/orderService";
import { createPaymentService } from "@/application/orders/paymentService";
import { createReceiptService } from "@/application/orders/receiptService";
import { SyncEngine } from "@/application/sync/engine";
import { createIndexedDbCache } from "@/repository/local/indexeddb/cache";
import { createIndexedDbQueue } from "@/repository/local/indexeddb/queue";
import { makeLocalClientsStores } from "@/repository/local/clients";
import { makeLocalOrderStores } from "@/repository/local/orders";
import { makeLocalPaymentsRepository } from "@/repository/local/payments";
import { makeLocalReceiptsRepository } from "@/repository/local/receipts";
import { createFakeSyncServer } from "../../support/fakeSyncServer";

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
  const receipts = createReceiptService({
    tenantId,
    profileId: "p-owner",
    orders: orderStores.orders,
    payments: makeLocalPaymentsRepository(cache),
    receipts: makeLocalReceiptsRepository(cache),
    engine,
    now,
    uuid,
  });
  return { cache, server, engine, clients, orders, payments, receipts };
}

async function createOrder(
  h: ReturnType<typeof makeHarness>,
  unitPrice = 50000,
) {
  const customer = await h.clients.createCustomer({ full_name: "Awa Diop" });
  if (!customer.ok) return null;
  const created = await h.orders.createOrder({
    customerId: customer.customer.id,
    priority: "NORMAL",
    items: [{ description: "Robe de mariée", quantity: 1, unit_price: unitPrice }],
  });
  return created.ok ? created.order : null;
}

describe("createReceiptService", () => {
  it("émet un reçu sur un paiement validé, cohérent avec le solde", async () => {
    const h = makeHarness();
    const order = await createOrder(h);
    if (!order) return;

    const paid = await h.payments.recordPayment({
      orderId: order.id,
      amount: 20000,
      method: "CASH",
      note: "Acompte",
    });
    if (!paid.ok) return;

    const issued = await h.receipts.issuePaymentReceipt(paid.payment.id);
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;

    expect(issued.receipt.reference).toMatch(/^REC-2026-\d{6}$/);
    expect(issued.receipt.amount).toBe(20000);
    expect(issued.receipt.method).toBe("CASH");
    expect(issued.receipt.is_correction).toBe(false);
    expect(issued.receipt.payment_id).toBe(paid.payment.id);
    expect(issued.receipt.state).toEqual({
      total: 50000,
      totalPaid: 20000,
      remaining: 30000,
      surplus: 0,
    });

    const list = await h.receipts.orderReceipts(order.id);
    expect(list).toHaveLength(1);
    expect(list[0].reference).toBe(issued.receipt.reference);
  });

  it("séquence de référence croissante par tenant", async () => {
    const h = makeHarness();
    const order = await createOrder(h);
    if (!order) return;
    const p1 = await h.payments.recordPayment({
      orderId: order.id,
      amount: 10000,
      method: "WAVE",
    });
    const p2 = await h.payments.recordPayment({
      orderId: order.id,
      amount: 15000,
      method: "CASH",
    });
    if (!(p1.ok && p2.ok)) return;

    const r1 = await h.receipts.issuePaymentReceipt(p1.payment.id);
    const r2 = await h.receipts.issuePaymentReceipt(p2.payment.id);
    expect(r1.ok && r2.ok).toBe(true);
    if (!(r1.ok && r2.ok)) return;
    expect(r1.receipt.reference.endsWith("000001")).toBe(true);
    expect(r2.receipt.reference.endsWith("000002")).toBe(true);
  });

  it("refuse un doublon de reçu pour le même paiement", async () => {
    const h = makeHarness();
    const order = await createOrder(h);
    if (!order) return;
    const paid = await h.payments.recordPayment({
      orderId: order.id,
      amount: 10000,
      method: "CASH",
    });
    if (!paid.ok) return;

    const first = await h.receipts.issuePaymentReceipt(paid.payment.id);
    expect(first.ok).toBe(true);
    const twice = await h.receipts.issuePaymentReceipt(paid.payment.id);
    expect(twice.ok).toBe(false);
    if (!twice.ok) expect(twice.reason).toContain("déjà");

    const correctionBeforeCancel = await h.receipts.issueCorrectionReceipt(
      paid.payment.id,
    );
    expect(correctionBeforeCancel.ok).toBe(false);
  });

  it("emprisonne l'état au moment de l'émission (avant/après annulation)", async () => {
    const h = makeHarness();
    const order = await createOrder(h);
    if (!order) return;

    const a = await h.payments.recordPayment({ orderId: order.id, amount: 20000, method: "CASH" });
    const b = await h.payments.recordPayment({ orderId: order.id, amount: 15000, method: "WAVE" });
    const c = await h.payments.recordPayment({ orderId: order.id, amount: 20000, method: "TRANSFER" });
    if (!(a.ok && b.ok && c.ok)) return;

    const receipt = await h.receipts.issuePaymentReceipt(c.payment.id);
    expect(receipt.ok).toBe(true);
    if (receipt.ok) {
      expect(receipt.receipt.state).toEqual({
        total: 50000,
        totalPaid: 55000,
        remaining: 0,
        surplus: 5000,
      });
    }

    const cancelled = await h.payments.cancelPayment(
      c.payment.id,
      "Remboursement du trop-perçu",
    );
    expect(cancelled.ok).toBe(true);

    const credit = await h.receipts.issueCorrectionReceipt(c.payment.id);
    expect(credit.ok).toBe(true);
    if (!credit.ok) return;
    expect(credit.receipt.is_correction).toBe(true);
    expect(credit.receipt.reference.endsWith("000002")).toBe(true);
    expect(credit.receipt.state).toEqual({
      total: 50000,
      totalPaid: 35000,
      remaining: 15000,
      surplus: 0,
    });

    const doubleCredit = await h.receipts.issueCorrectionReceipt(c.payment.id);
    expect(doubleCredit.ok).toBe(false);
  });

  it("les reçus sont immuables localement et poussés une seule fois", async () => {
    const h = makeHarness();
    const order = await createOrder(h);
    if (!order) return;
    const paid = await h.payments.recordPayment({
      orderId: order.id,
      amount: 10000,
      method: "CASH",
    });
    if (!paid.ok) return;
    const issued = await h.receipts.issuePaymentReceipt(paid.payment.id);
    if (!issued.ok) return;

    const repo = makeLocalReceiptsRepository(h.cache);
    await expect(repo.saveReceipt(issued.receipt)).rejects.toThrow("RECEIPT_IMMUTABLE");

    const report = await h.engine.flush();
    expect(report.networkError).toBeNull();
    const receipts = h.server.pushed().filter((op) => op.entity === "receipts");
    expect(receipts).toHaveLength(1);
    expect(receipts[0].operation).toBe("INSERT");

    expect(await h.engine.flush()).toMatchObject({ synced: 0, attempted: 0 });
  });
});