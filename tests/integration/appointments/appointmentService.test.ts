import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { createAppointmentService } from "@/application/appointments/appointmentService";
import { createNotificationService } from "@/application/appointments/notificationService";
import { createClientsService } from "@/application/clients/clientService";
import { SyncEngine } from "@/application/sync/engine";
import { createIndexedDbCache } from "@/repository/local/indexeddb/cache";
import { createIndexedDbQueue } from "@/repository/local/indexeddb/queue";
import { makeLocalAppointmentsStores } from "@/repository/local/appointments";
import { makeLocalClientsStores } from "@/repository/local/clients";
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
  const appointments = createAppointmentService({
    tenantId,
    profileId: "p-owner",
    appointments: appointmentStores.appointments,
    notifications: appointmentStores.notifications,
    customers: clientStores.customers,
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
  return { cache, server, engine, clients, appointments, notifications };
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

  it("génère un rappel WhatsApp automatique si le client a un numéro", async () => {
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

    const reminded = await h.notifications.listNotifications();
    expect(reminded).toHaveLength(1);
    const toast = reminded[0];
    expect(toast.channel).toBe("WHATSAPP");
    expect(toast.type).toBe("APPOINTMENT_REMINDER");
    expect(toast.title).toBe("Rappel de rendez-vous");
    expect(toast.body).toContain("Bineta Kone");
    expect(toast.body).toContain("Livraison");
    expect((toast.payload as { appointment_id: string }).appointment_id).toBe(
      created.appointment.id,
    );
    expect((toast.payload as { whatsapp: string }).whatsapp).toBe("+221771234567");
    expect(toast.sent_at).toBeNull();
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
    expect(pushed.filter((op) => op.entity === "notifications")).toHaveLength(1);
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