import { describe, expect, it } from "vitest";
import type { AppointmentRecord } from "@/domain/appointments/appointments";
import type { Customer } from "@/domain/clients/customer";
import type { FabricRecord } from "@/domain/inventory/fabrics";
import type { OrderRecord } from "@/domain/orders/order";
import { permissionsFor } from "@/domain/team/roles";
import {
  computeAlerts,
  DEFAULT_ALERT_PREFS,
  normalizePrefs,
  pendingAlerts,
  prunePlayed,
  type AlertData,
  type AlertPrefs,
} from "@/domain/notifications/alerts";

const NOW = "2026-10-14T09:00:00.000Z";
const ON: AlertPrefs = { ...DEFAULT_ALERT_PREFS, enabled: true };

const appt = (id: string, startsAt: string, over: Partial<AppointmentRecord> = {}): AppointmentRecord => ({
  id,
  tenant_id: "t1",
  customer_id: "c1",
  order_id: null,
  type: "FITTING",
  starts_at: startsAt,
  ends_at: null,
  status: "SCHEDULED",
  note: null,
  reminder_sent_at: null,
  created_by: null,
  created_at: NOW,
  updated_at: NOW,
  deleted_at: null,
  ...over,
});

const order = (id: string, expected: string | null, status: OrderRecord["status"] = "SEWING"): OrderRecord => ({
  id,
  tenant_id: "t1",
  customer_id: "c1",
  reference: `ORD-2026-00000${id}`,
  status,
  priority: "NORMAL",
  total_price: 1000,
  expected_at: expected,
  delivered_at: null,
  employee_id: null,
  notes: null,
  created_by: null,
  created_at: NOW,
  updated_at: NOW,
  deleted_at: null,
});

const data = (over: Partial<AlertData> = {}): AlertData => ({
  now: NOW,
  timeZone: "UTC",
  permissions: new Set(permissionsFor("OWNER")),
  appointments: [],
  customers: [{ id: "c1", full_name: "Awa Diop" } as Customer],
  orders: [],
  fabrics: [],
  ...over,
});

describe("alertes de l'atelier", () => {
  it("rien tant que les alertes ne sont pas activées", () => {
    expect(computeAlerts(data({ appointments: [appt("a", "2026-10-14T09:10:00.000Z")] }), DEFAULT_ALERT_PREFS)).toEqual([]);
  });

  it("rendez-vous imminent : dans le délai choisi, jusqu'à 5 min après le début", () => {
    const list = [
      appt("tot", "2026-10-14T09:20:00.000Z"),
      appt("loin", "2026-10-14T10:00:00.000Z"),
      appt("passe", "2026-10-14T08:50:00.000Z"),
      appt("annule", "2026-10-14T09:15:00.000Z", { status: "CANCELLED" }),
      appt("maintenant", "2026-10-14T08:57:00.000Z"),
    ];
    const alerts = computeAlerts(data({ appointments: list }), { ...ON, dailyHour: 23 });
    expect(alerts.map((a) => a.key)).toEqual([`appt:tot:${Date.parse("2026-10-14T09:20:00.000Z")}`, `appt:maintenant:${Date.parse("2026-10-14T08:57:00.000Z")}`]);
    expect(alerts[0]).toMatchObject({ title: "Rendez-vous dans 20 min", body: "Awa Diop — Essayage à 09:20", url: "/rdv", urgent: true });
    expect(alerts[1].title).toBe("Rendez-vous maintenant");
    expect(computeAlerts(data({ appointments: list }), { ...ON, leadMinutes: 60, dailyHour: 23 }).map((a) => a.key)).toContain(`appt:loin:${Date.parse("2026-10-14T10:00:00.000Z")}`);
    expect(computeAlerts(data({ appointments: list }), { ...ON, leadMinutes: 0, dailyHour: 23 })).toEqual([]);
  });

  it("un rendez-vous déplacé sonne à nouveau (clé liée à l'horaire)", () => {
    const a = computeAlerts(data({ appointments: [appt("a", "2026-10-14T09:20:00.000Z")] }), { ...ON, dailyHour: 23 })[0];
    const b = computeAlerts(data({ appointments: [appt("a", "2026-10-14T09:25:00.000Z")] }), { ...ON, dailyHour: 23 })[0];
    expect(a.key).not.toBe(b.key);
  });

  it("résumé du jour après l'heure choisie : rappels, livraisons, retards, stock", () => {
    const alerts = computeAlerts(
      data({
        appointments: [appt("d", "2026-10-15T10:00:00.000Z")],
        orders: [order("1", "2026-10-14"), order("2", "2026-10-10"), order("3", "2026-10-14", "DELIVERED"), order("4", null)],
        fabrics: [{ id: "f", name: "Bazin", quantity: 50, status: "ACTIVE" } as FabricRecord],
      }),
      ON,
    );
    expect(alerts.map((a) => a.kind)).toEqual(["REMINDERS_TO_SEND", "ORDERS_DUE", "STOCK_LOW"]);
    expect(alerts[0]).toMatchObject({ key: "reminders:2026-10-14", title: "1 rappel à envoyer" });
    expect(alerts[1]).toMatchObject({ title: "Commandes en retard", body: "1 commande à livrer aujourd'hui, 1 commande en retard." });
    expect(alerts[2].body).toBe("Bazin est presque épuisé.");
    expect(computeAlerts(data({ orders: [order("1", "2026-10-14")] }), { ...ON, dailyHour: 10 })).toEqual([]);
  });

  it("respecte le rôle : pas d'alerte sur ce que le rôle ne voit pas", () => {
    const perms = new Set(permissionsFor("APPRENTICE").filter((p) => p !== "stock.read" && p !== "appointments.read"));
    const alerts = computeAlerts(
      data({ permissions: perms, appointments: [appt("a", "2026-10-14T09:10:00.000Z")], fabrics: [{ id: "f", name: "x", quantity: 0, status: "ACTIVE" } as FabricRecord] }),
      ON,
    );
    expect(alerts).toEqual([]);
  });

  it("ne rejoue pas une alerte déjà jouée, urgentes d'abord", () => {
    const alerts = computeAlerts(
      data({ appointments: [appt("a", "2026-10-14T09:10:00.000Z"), appt("d", "2026-10-15T10:00:00.000Z")] }),
      ON,
    );
    expect(pendingAlerts(alerts, new Set())[0].urgent).toBe(true);
    expect(pendingAlerts(alerts, new Set(alerts.map((a) => a.key)))).toEqual([]);
  });

  it("nettoyage des clés et réglages invalides", () => {
    expect(prunePlayed(["orders:2026-10-01", "orders:2026-10-12", "appt:x:2026-10-13T09:00:00.000Z", "test"], "2026-10-14")).toEqual([
      "orders:2026-10-12",
      "appt:x:2026-10-13T09:00:00.000Z",
      "test",
    ]);
    expect(normalizePrefs({ enabled: true, leadMinutes: 7, dailyHour: 30, sound: false })).toEqual({ enabled: true, sound: false, leadMinutes: 30, dailyHour: 8 });
    expect(normalizePrefs(null)).toEqual(DEFAULT_ALERT_PREFS);
  });
});
