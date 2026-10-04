import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { createClientsService } from "@/application/clients/clientService";
import { createOrderService } from "@/application/orders/orderService";
import { SyncEngine } from "@/application/sync/engine";
import { createIndexedDbCache } from "@/repository/local/indexeddb/cache";
import { createIndexedDbQueue } from "@/repository/local/indexeddb/queue";
import { makeLocalClientsStores } from "@/repository/local/clients";
import { makeLocalOrderStores } from "@/repository/local/orders";
import { createFakeSyncServer } from "../../support/fakeSyncServer";
import type { OrderItemDraft } from "@/domain/orders/order";

const TENANT = "00000000-0000-4000-8000-000000000014";

let tenantSeq = 0;
const uniqueTenant = () =>
  `00000000-0000-4000-8000-00000000${(tenantSeq += 1).toString(16).padStart(8, "0")}`;

function makeHarness(tenantId: string = TENANT) {
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
  return { cache, server, engine, clients, orders };
}

const ITEM_ROBE: OrderItemDraft = {
  description: "Robe de mariée",
  quantity: 1,
  unit_price: 25000,
};

const ITEM_VOILE: OrderItemDraft = {
  description: "Voile court",
  quantity: 2,
  unit_price: 8000,
};

describe("createOrderService", () => {
  it("crée une commande : référence, total, persistance locale et file de sync", async () => {
    const h = makeHarness(uniqueTenant());
    const customer = await h.clients.createCustomer({
      full_name: "Awa Diop",
      phone: "771234567",
    });
    if (!customer.ok) return;

    const res = await h.orders.createOrder({
      customerId: customer.customer.id,
      priority: "NORMAL",
      expectedAt: "2026-10-01",
      notes: "Essayage prévu fin de mois",
      items: [ITEM_ROBE, ITEM_VOILE],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.order.reference).toMatch(/^ORD-2026-\d{6}$/);
    expect(res.order.total_price).toBe(25000 + 2 * 8000);
    expect(res.order.status).toBe("REGISTERED");
    expect(res.order.expected_at).toBe("2026-10-01");
    expect(res.items).toHaveLength(2);
    expect(res.items[1].sort_order).toBe(1);

    const detail = await h.orders.getOrderDetail(res.order.id);
    expect(detail).not.toBeNull();
    expect(detail?.customerName).toBe("Awa Diop");
    expect(detail?.items).toHaveLength(2);
    expect(detail?.history).toHaveLength(1);
    if (detail) {
      expect(detail.history[0].to_status).toBe("REGISTERED");
      expect(detail.history[0].from_status).toBeNull();
    }

    const cached = await h.cache.get("orders", res.order.id);
    expect((cached as { reference: string }).reference).toBe(res.order.reference);
  });

  it("accepte un client créé après une première commande (client saisi avec la commande)", async () => {
    const h = makeHarness(uniqueTenant());
    const first = await h.clients.createCustomer({ full_name: "Awa Diop" });
    if (!first.ok) return;
    expect((await h.orders.createOrder({ customerId: first.customer.id, priority: "NORMAL", items: [ITEM_ROBE] })).ok).toBe(true);
    // Nouveau client saisi dans le formulaire de commande, après le premier chargement.
    const walkIn = await h.clients.createCustomer({ full_name: "Khady Sow", phone: "789998877", whatsapp: "789998877" });
    if (!walkIn.ok) return;
    const res = await h.orders.createOrder({ customerId: walkIn.customer.id, priority: "NORMAL", items: [ITEM_VOILE] });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.order.customer_id).toBe(walkIn.customer.id);
    // Un identifiant vraiment inconnu reste refusé.
    const unknown = await h.orders.createOrder({ customerId: "99999999-0000-4000-8000-000000000000", priority: "NORMAL", items: [ITEM_ROBE] });
    expect(unknown.ok).toBe(false);
  });

  it("incrémente la séquence de référence par tenant", async () => {
    const h = makeHarness(uniqueTenant());
    const customer = await h.clients.createCustomer({ full_name: "Awa Diop" });
    if (!customer.ok) return;
    const first = await h.orders.createOrder({
      customerId: customer.customer.id,
      priority: "NORMAL",
      items: [ITEM_ROBE],
    });
    const second = await h.orders.createOrder({
      customerId: customer.customer.id,
      priority: "NORMAL",
      items: [ITEM_VOILE],
    });
    expect(first.ok && second.ok).toBe(true);
    if (!(first.ok && second.ok)) return;
    expect(second.order.reference.endsWith("000002")).toBe(true);
  });

  it("refuse une commande sans client ou sans article valide", async () => {
    const h = makeHarness(uniqueTenant());
    const res = await h.orders.createOrder({
      customerId: "",
      priority: "NORMAL",
      items: [],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.customerId).toBeTruthy();
      expect(res.errors.generic).toBeTruthy();
    }

    const customer = await h.clients.createCustomer({ full_name: "Awa Diop" });
    if (!customer.ok) return;
    const bad = await h.orders.createOrder({
      customerId: customer.customer.id,
      priority: "NORMAL",
      items: [{ description: "  ", quantity: 0, unit_price: -5 }],
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.errors).length).toBeGreaterThan(0);
  });

  it("déroule le workflow avec historique immuable et enregistrements en sync", async () => {
    const h = makeHarness(uniqueTenant());
    const customer = await h.clients.createCustomer({ full_name: "Awa Diop" });
    if (!customer.ok) return;
    const created = await h.orders.createOrder({
      customerId: customer.customer.id,
      priority: "HIGH",
      items: [ITEM_ROBE],
    });
    if (!created.ok) return;

    const first = await h.orders.transition(created.order.id, "SEWING");
    expect(first.ok).toBe(true);
    const second = await h.orders.transition(created.order.id, "READY_FOR_PICKUP");
    expect(second.ok).toBe(true);
    const delivered = await h.orders.transition(created.order.id, "DELIVERED");
    expect(delivered.ok).toBe(true);
    if (!delivered.ok) return;
    expect(delivered.order.delivered_at).not.toBeNull();

    const terminal = await h.orders.transition(created.order.id, "SEWING");
    expect(terminal.ok).toBe(false);
    if (!terminal.ok) expect(terminal.reason).toContain("interdite");

    const detail = await h.orders.getOrderDetail(created.order.id);
    expect(detail?.history).toHaveLength(4);
    if (detail) {
      expect(detail.history.map((h) => h.to_status)).toEqual([
        "DELIVERED",
        "READY_FOR_PICKUP",
        "SEWING",
        "REGISTERED",
      ]);
    }
  });

  it("la liste regroupe articles et historique exactement comme le détail de chaque commande", async () => {
    const h = makeHarness(uniqueTenant());
    const customer = await h.clients.createCustomer({ full_name: "Awa Diop" });
    if (!customer.ok) throw new Error("client");
    for (const items of [[ITEM_ROBE, ITEM_VOILE], [ITEM_VOILE], [ITEM_ROBE]]) {
      const created = await h.orders.createOrder({ customerId: customer.customer.id, priority: "NORMAL", items });
      if (!created.ok) throw new Error("commande");
      await h.orders.transition(created.order.id, "FABRIC_RECEIVED");
    }
    const rows = await h.orders.listOrders({});
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      const detail = await h.orders.getOrderDetail(row.order.id);
      expect(row.items).toEqual(detail?.items);
      expect(row.history).toEqual(detail?.history);
    }
  });

  it("changement de prix : le total reste figé à la création, même après modification", async () => {
    const h = makeHarness(uniqueTenant());
    const customer = await h.clients.createCustomer({ full_name: "Awa Diop" });
    if (!customer.ok) throw new Error("client");
    const created = await h.orders.createOrder({ customerId: customer.customer.id, priority: "NORMAL", items: [ITEM_ROBE] });
    if (!created.ok) throw new Error("commande");
    const id = created.order.id;

    // Une saisie qui glisserait un autre prix n'a aucun effet : seul l'en-tête change.
    const updated = await h.orders.updateHeader(id, {
      priority: "URGENT",
      notes: "retouche",
      total_price: 1,
    } as Parameters<typeof h.orders.updateHeader>[1]);
    expect(updated?.total_price).toBe(25000);
    expect(updated?.priority).toBe("URGENT");
    expect((await h.orders.getOrderDetail(id))?.order.total_price).toBe(25000);

    await h.engine.flush();
    const update = h.server.pushed().find((op) => op.entity === "orders" && op.operation === "UPDATE");
    expect((update?.payload as { total_price: number }).total_price).toBe(25000);
  });

  it("affecte puis retire l'affectation, chaque changement part en sync", async () => {
    const h = makeHarness(uniqueTenant());
    const customer = await h.clients.createCustomer({ full_name: "Awa Diop" });
    if (!customer.ok) throw new Error("client");
    const created = await h.orders.createOrder({ customerId: customer.customer.id, priority: "NORMAL", items: [ITEM_ROBE] });
    if (!created.ok) throw new Error("commande");
    const id = created.order.id;
    const EMP = "aaaaaaaa-0000-4000-8000-0000000000e1";

    expect((await h.orders.assign(id, EMP))?.employee_id).toBe(EMP);
    expect((await h.orders.getOrderDetail(id))?.order.employee_id).toBe(EMP);
    expect(await h.orders.assign("inconnue", EMP)).toBeNull();
    await h.orders.assign(id, EMP); // inchangé : aucune opération en plus
    expect((await h.orders.assign(id, null))?.employee_id).toBeNull();

    await h.orders.transition(id, "FABRIC_RECEIVED");

    await h.engine.flush();
    const updates = h.server.pushed().filter((op) => op.entity === "orders" && op.operation === "UPDATE");
    expect(updates).toHaveLength(3);
    expect(updates.slice(0, 2).map((op) => (op.payload as { employee_id: string | null }).employee_id)).toEqual([EMP, null]);
    // Un changement d'étape n'envoie pas l'affectation (pas d'écrasement serveur).
    expect(updates[2].payload as object).not.toHaveProperty("employee_id");
    expect((updates[2].payload as { status: string }).status).toBe("FABRIC_RECEIVED");
  });

  it("annule avec raison obligatoire, jamais de suppression", async () => {
    const h = makeHarness(uniqueTenant());
    const customer = await h.clients.createCustomer({ full_name: "Awa Diop" });
    if (!customer.ok) return;
    const created = await h.orders.createOrder({
      customerId: customer.customer.id,
      priority: "NORMAL",
      items: [ITEM_ROBE],
    });
    if (!created.ok) return;

    const noReason = await h.orders.cancel(created.order.id, "");
    expect(noReason.ok).toBe(false);

    const cancelled = await h.orders.cancel(created.order.id, "Client a renoncé");
    expect(cancelled.ok).toBe(true);
    if (!cancelled.ok) return;
    expect(cancelled.order.status).toBe("CANCELLED");

    expect(await h.cache.get("orders", created.order.id)).not.toBeNull();
    const list = await h.orders.listOrders({});
    expect(list).toHaveLength(0);
    const all = await h.orders.listOrders({ includeArchive: true });
    expect(all).toHaveLength(1);
  });

  it("pousse toutes les écritures au serveur de façon idempotente", async () => {
    const h = makeHarness(uniqueTenant());
    const customer = await h.clients.createCustomer({ full_name: "Awa Diop" });
    if (!customer.ok) return;
    await h.orders.createOrder({
      customerId: customer.customer.id,
      priority: "NORMAL",
      items: [ITEM_ROBE, ITEM_VOILE],
    });

    const created = await h.orders.listOrders({ includeArchive: true });
    const orderRow = created[0];
    if (!orderRow) return;
    const first = await h.orders.transition(orderRow.order.id, "SEWING");
    expect(first.ok).toBe(true);

    const report = await h.engine.flush();
    const entities = h.server.pushed().map((op) => op.entity);
    expect(entities.filter((e) => e === "orders").length).toBe(2);
    expect(entities.filter((e) => e === "order_items").length).toBe(2);
    expect(entities.filter((e) => e === "order_status_history").length).toBe(2);
    expect(report.networkError).toBeNull();

    const again = await h.engine.flush();
    expect(again.attempted).toBe(0);
    expect(again.synced).toBe(0);
  });
});