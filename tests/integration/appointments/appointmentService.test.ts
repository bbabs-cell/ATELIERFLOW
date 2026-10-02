import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { createAppointmentService } from "@/application/appointments/appointmentService";
import { createNotificationService } from "@/application/appointments/notificationService";
import { createClientsService } from "@/application/clients/clientService";
import { createOrderService } from "@/application/orders/orderService";
import { SyncEngine } from "@/application/sync/engine";
import { createIndexedDbCache } from "@/repository/local/indexeddb/cache";
import { createIndexedDbQueue } from "@/repository/local/indexeddb/queue";
import { makeLocalAppointmentsStores } from "@/repository/local/appointments";
import { makeLocalClientsStores } from "@/repository/local/clients";
import { makeLocalOrderStores } from "@/repository/local/orders";
import { createFakeSyncServer } from "../../support/fakeSyncServer";

let tenantSeq = 0;
const uniqueTenant = () =>
  `00000000-0000-4000-8000-00000000${(tenantSeq += 1).toString(16).padStart(8, "0")}`;

function localDateTime(year: number, month: number, day: number, hour = 9, minute = 0) {
  return new Date(year, month - 1, day, hour, minute).toISOString();
}

function makeHarness(tenantId: string = uniqueTenant()) {
  const queue = createIndexedDbQueue(tenantId);
  const cache = createIndexedDbCache(tenantId);
  const server = createFakeSyncServer();
  const clientStores = makeLocalClientsStores(cache);
  const appointmentStores = makeLocalAppointmentsStores(cache);
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
  const appointments = createAppointmentService({
    tenantId,
    profileId: "p-owner",
    appointments: appointmentStores.appointments,
    customers: clientStores.customers,
    orders: orderStores.orders,
    engine,
    now,
    uuid,
  });
  const notifications = createNotificationService({
    tenantId,
    profileId: "p-owner",
    notifications: appointmentStores.notifications,
    engine,
    now,
    uuid,
  });
  return { cache, server, engine, clients, orders, appointments, notifications };
}

describe("createAppointmentService", () => {
  it("crée un rendez-vous (sans rappel sans numéro WhatsApp)", async () => {
    const h = makeHarness();
    const customer = await h.clients.createCustomer({ full_name: "Awa Diop" });
    if (!customer.ok) return;

    const created = await h.appointments.createAppointment({
      customerId: customer.customer.id,
      type: "FITTING",
      startsAt: localDateTime(2026, 9, 28, 10, 0),
      note: "Premier essayage",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect(created.appointment.status).toBe("SCHEDULED");
    expect(created.appointment.type).toBe("FITTING");
    expect(created.appointment.customer_id).toBe(customer.customer.id);

    const list = await h.appointments.listAppointments();
    expect(list).toHaveLength(1);
    expect(list[0].customer?.full_name).toBe("Awa Diop");

    const reminded = await h.notifications.listNotifications();
    expect(reminded).toHaveLength(0);
  });

  it("ne crée plus de notification : le rappel est suivi sur le rendez-vous", async () => {
    const h = makeHarness();
    const customer = await h.clients.createCustomer({
      full_name: "Bineta Kone",
      whatsapp: "+221771234567",
    });
    if (!customer.ok) return;

    const created = await h.appointments.createAppointment({
      customerId: customer.customer.id,
      type: "DELIVERY",
      startsAt: localDateTime(2026, 9, 30, 16, 30),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.appointment.reminder_sent_at).toBeNull();
    expect(await h.notifications.listNotifications()).toHaveLength(0);

    const sent = await h.appointments.markReminderSent(created.appointment.id);
    expect(sent.ok).toBe(true);
    if (sent.ok) expect(sent.appointment.reminder_sent_at).not.toBeNull();
  });

  it("modifie un rendez-vous : commande liée du client, nouvel horaire => rappel à renvoyer", async () => {
    const h = makeHarness();
    const awa = await h.clients.createCustomer({ full_name: "Awa Diop" });
    const fatou = await h.clients.createCustomer({ full_name: "Fatou Sow" });
    if (!awa.ok || !fatou.ok) return;
    const order = await h.orders.createOrder({
      customerId: awa.customer.id,
      priority: "NORMAL",
      items: [{ description: "Boubou", quantity: 1, unit_price: 50000 }],
    });
    if (!order.ok) return;

    const wrong = await h.appointments.createAppointment({
      customerId: fatou.customer.id,
      orderId: order.order.id,
      type: "FITTING",
      startsAt: localDateTime(2026, 10, 6, 10, 0),
    });
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.errors.orderId).toContain("autre client");

    const created = await h.appointments.createAppointment({
      customerId: awa.customer.id,
      orderId: order.order.id,
      type: "FITTING",
      startsAt: localDateTime(2026, 10, 6, 10, 0),
      endsAt: localDateTime(2026, 10, 6, 11, 0),
    });
    if (!created.ok) return;
    const listed = await h.appointments.getAppointment(created.appointment.id);
    expect(listed?.order?.reference).toBe(order.order.reference);

    await h.appointments.markReminderSent(created.appointment.id);
    const sameTime = await h.appointments.updateAppointment(created.appointment.id, {
      customerId: awa.customer.id,
      orderId: order.order.id,
      type: "FITTING",
      startsAt: localDateTime(2026, 10, 6, 10, 0),
      endsAt: localDateTime(2026, 10, 6, 11, 0),
      note: "Apporter le tissu",
    });
    expect(sameTime.ok).toBe(true);
    if (sameTime.ok) {
      expect(sameTime.rescheduled).toBe(false);
      expect(sameTime.appointment.reminder_sent_at).not.toBeNull();
      expect(sameTime.appointment.note).toBe("Apporter le tissu");
    }

    const moved = await h.appointments.updateAppointment(created.appointment.id, {
      customerId: awa.customer.id,
      orderId: null,
      type: "ALTERATION",
      startsAt: localDateTime(2026, 10, 7, 15, 0),
      endsAt: null,
    });
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.rescheduled).toBe(true);
    expect(moved.appointment).toMatchObject({ order_id: null, ends_at: null, type: "ALTERATION", reminder_sent_at: null, status: "SCHEDULED" });

    await h.engine.flush();
    const updates = h.server.pushed().filter((op) => op.entity === "appointments" && op.operation === "UPDATE");
    expect(updates.length).toBe(3);
    const last = updates[updates.length - 1].payload as Record<string, unknown>;
    expect(last).toHaveProperty("order_id", null);
    expect(last).toHaveProperty("ends_at", null);
    expect(last).toHaveProperty("reminder_sent_at", null);

    await h.appointments.transitionAppointment(created.appointment.id, "CANCELLED");
    const closed = await h.appointments.updateAppointment(created.appointment.id, {
      customerId: awa.customer.id,
      type: "OTHER",
      startsAt: localDateTime(2026, 10, 8, 9, 0),
    });
    expect(closed.ok).toBe(false);
    expect((await h.appointments.markReminderSent(created.appointment.id)).ok).toBe(false);
  });

  it("refuse un client introuvable", async () => {
    const h = makeHarness();
    const created = await h.appointments.createAppointment({
      customerId: "nimporte-quoi",
      type: "OTHER",
      startsAt: localDateTime(2026, 9, 28, 10, 0),
    });
    expect(created.ok).toBe(false);
    if (!created.ok) expect(created.errors.customerId).toBe("Client introuvable.");
  });

  it("supporte les transitions et signale les blocages", async () => {
    const h = makeHarness();
    const customer = await h.clients.createCustomer({ full_name: "Lieke Yamba" });
    if (!customer.ok) return;
    const created = await h.appointments.createAppointment({
      customerId: customer.customer.id,
      type: "MEASUREMENTS",
      startsAt: localDateTime(2026, 10, 2, 9, 0),
    });
    if (!created.ok) return;

    const confirmed = await h.appointments.transitionAppointment(
      created.appointment.id,
      "CONFIRMED",
    );
    expect(confirmed.ok).toBe(true);
    if (confirmed.ok) expect(confirmed.appointment.status).toBe("CONFIRMED");

    const finished = await h.appointments.transitionAppointment(
      created.appointment.id,
      "COMPLETED",
    );
    expect(finished.ok).toBe(true);

    const blocked = await h.appointments.transitionAppointment(
      created.appointment.id,
      "SCHEDULED",
    );
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toContain("impossible");

    const missing = await h.appointments.transitionAppointment("absent", "COMPLETED");
    expect(missing.ok).toBe(false);
  });

  it("pousse les entités une seule fois (flush idempotent)", async () => {
    const h = makeHarness();
    const customer = await h.clients.createCustomer({
      full_name: "Aminata Sarr",
      whatsapp: "+221770112233",
    });
    if (!customer.ok) return;
    const created = await h.appointments.createAppointment({
      customerId: customer.customer.id,
      type: "ALTERATION",
      startsAt: localDateTime(2026, 10, 5, 11, 0),
    });
    expect(created.ok).toBe(true);

    const report = await h.engine.flush();
    expect(report.networkError).toBeNull();
    const pushed = h.server.pushed();
    expect(pushed.filter((op) => op.entity === "appointments")).toHaveLength(1);
    expect(pushed.filter((op) => op.entity === "notifications")).toHaveLength(0);
    expect(pushed.every((op) => op.operation === "INSERT")).toBe(true);

    expect(await h.engine.flush()).toMatchObject({ synced: 0, attempted: 0 });
  });

  it("marque une notification lue de façon idempotente", async () => {
    const h = makeHarness();
    const read = await h.notifications.createNotification({
      type: "APPOINTMENT_REMINDER",
      channel: "WHATSAPP",
      title: "Rappel",
      body: "Message en attente",
    });
    expect(read.ok).toBe(true);
    if (!read.ok) return;

    const first = await h.notifications.markRead(read.notification.id);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.notification.read_at).not.toBeNull();

    const again = await h.notifications.markRead(read.notification.id);
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.notification.read_at).toBe(first.notification.read_at);

    const missing = await h.notifications.markRead("inconnue");
    expect(missing.ok).toBe(false);
  });
});