import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { SyncEngine } from "@/application/sync/engine";
import { createClientsService } from "@/application/clients/clientService";
import { createOrderService } from "@/application/orders/orderService";
import { createPaymentService } from "@/application/orders/paymentService";
import { createReceiptService } from "@/application/orders/receiptService";
import { createAppointmentService } from "@/application/appointments/appointmentService";
import { createStockService } from "@/application/stock/stockService";
import { createIndexedDbCache } from "@/repository/local/indexeddb/cache";
import { createIndexedDbQueue } from "@/repository/local/indexeddb/queue";
import { makeLocalClientsStores } from "@/repository/local/clients";
import { makeLocalOrderStores } from "@/repository/local/orders";
import { makeLocalPaymentsRepository } from "@/repository/local/payments";
import { makeLocalAppointmentsStores } from "@/repository/local/appointments";
import { makeLocalInventoryStores } from "@/repository/local/inventory";
import { makeLocalReceiptsRepository } from "@/repository/local/receipts";
import { createFakeSyncServer } from "../../support/fakeSyncServer";

let tenantSeq = 0;
const uniqueTenant = () =>
  `00000000-0000-4000-8000-00000000${(tenantSeq += 1).toString(16).padStart(8, "0")}`;

function makeHarness() {
  const tenantId = uniqueTenant();
  const queue = createIndexedDbQueue(tenantId);
  const cache = createIndexedDbCache(tenantId);
  const server = createFakeSyncServer();
  const clientStores = makeLocalClientsStores(cache);
  const orderStores = makeLocalOrderStores(cache);
  const appointmentStores = makeLocalAppointmentsStores(cache);
  const inventoryStores = makeLocalInventoryStores(cache);
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

  const base = { tenantId, profileId: "p-owner", engine, now, uuid };
  const clients = createClientsService({
    ...base,
    customers: clientStores.customers,
    profiles: clientStores.profiles,
    snapshots: clientStores.snapshots,
  });
  const orders = createOrderService({
    ...base,
    orders: orderStores.orders,
    items: orderStores.items,
    history: orderStores.history,
    customers: clientStores.customers,
  });
  const payments = createPaymentService({
    ...base,
    orders: orderStores.orders,
    payments: makeLocalPaymentsRepository(cache),
  });
  const receipts = createReceiptService({
    ...base,
    orders: orderStores.orders,
    payments: makeLocalPaymentsRepository(cache),
    receipts: makeLocalReceiptsRepository(cache),
  });
  const appointments = createAppointmentService({
    ...base,
    appointments: appointmentStores.appointments,
    notifications: appointmentStores.notifications,
    customers: clientStores.customers,
  });
  const stock = createStockService({
    ...base,
    fabrics: inventoryStores.fabrics,
    movements: inventoryStores.movements,
  });
  return { cache, server, engine, clients, orders, payments, receipts, appointments, stock };
}

describe("parcours complet au fil de l'eau (E2E)", () => {
  it("client → commande → paiement → reçu → RDV → stock, puis sync serveur", async () => {
    const h = makeHarness();

    const customer = await h.clients.createCustomer({
      full_name: "Awa Diop",
      phone: "771234567",
      whatsapp: "221771234567",
    });
    expect(customer.ok).toBe(true);
    if (!customer.ok) return;
    const customerId = customer.customer.id;

    const order = await h.orders.createOrder({
      customerId,
      priority: "NORMAL",
      expectedAt: "2026-10-01",
      notes: "Ajustements finaux",
      items: [
        { description: "Robe de mariée", quantity: 1, unit_price: 25000 },
        { description: "Voile court", quantity: 2, unit_price: 8000 },
      ],
    });
    expect(order.ok).toBe(true);
    if (!order.ok) return;
    expect(order.order.total_price).toBe(41_000);
    const orderId = order.order.id;

    const paidFull = await h.payments.recordPayment({
      orderId,
      amount: 25_000,
      method: "WAVE",
      note: "Premier acompte",
    });
    expect(paidFull.ok).toBe(true);
    if (!paidFull.ok) return;
    expect(paidFull.balance.remaining).toBe(16_000);

    const receipt = await h.receipts.issuePaymentReceipt(paidFull.payment.id);
    expect(receipt.ok).toBe(true);
    if (!receipt.ok) return;
    expect(receipt.receipt.reference).toMatch(/^REC-2026-\d{6}$/);
    expect(receipt.receipt.amount).toBe(25_000);

    const appt = await h.appointments.createAppointment({
      customerId,
      type: "FITTING",
      startsAt: "2026-10-01T10:00:00+02:00",
      endsAt: "2026-10-01T11:00:00+02:00",
    });
    expect(appt.ok).toBe(true);
    if (!appt.ok) return;

    const fabric = await h.stock.createFabric({
      name: "Wax ivoire",
      color: "Ivoire",
      initialMeters: "5,00",
    });
    expect(fabric.ok).toBe(true);
    if (!fabric.ok) return;
    const movement = await h.stock.recordMovement({
      fabricId: fabric.fabric.id,
      type: "IN",
      meters: "2,50",
    });
    expect(movement.ok).toBe(true);
    if (!movement.ok) return;
    expect(movement.fabric.quantity).toBe(750);

    await expect(h.engine.flush()).resolves.not.toThrow();
    const pushed = h.server.pushed();
    const entities = pushed.map((op) => op.entity);
    expect(entities).toContain("customers");
    expect(entities).toContain("orders");
    expect(entities).toContain("payments");
    expect(entities).toContain("receipts");
    expect(entities).toContain("appointments");
    expect(entities).toContain("fabrics");
    expect(entities).toContain("stock_movements");

    const orderOp = pushed.find((op) => op.entity === "orders");
    expect(orderOp).toBeDefined();
    expect(orderOp?.payload).toMatchObject({ id: orderId, reference: order.order.reference });
  });

  it("la deuxième sync est idempotente (aucun doublon serveur)", async () => {
    const h = makeHarness();

    const customer = await h.clients.createCustomer({ full_name: "Mamadou Sarr" });
    expect(customer.ok).toBe(true);
    if (!customer.ok) return;
    const order = await h.orders.createOrder({
      customerId: customer.customer.id,
      priority: "NORMAL",
      items: [{ description: "Costume", quantity: 1, unit_price: 12000 }],
    });
    expect(order.ok).toBe(true);
    if (!order.ok) return;

    await h.engine.flush();
    const pushedAfterFirst = h.server.pushedCount(
      h.server.pushed().find((op) => op.entity === "orders")?.idempotencyKey ?? "",
    );
    await h.engine.flush();
    const orderKey = h.server.pushed().find((op) => op.entity === "orders")?.idempotencyKey ?? "";
    expect(h.server.pushedCount(orderKey)).toBeGreaterThanOrEqual(pushedAfterFirst);
    expect(h.server.appliedCount(orderKey)).toBe(1);
  });
});