import { describe, expect, it } from "vitest";
import type { AppointmentRecord } from "@/domain/appointments/appointments";
import {
  appointmentStatusForOrder,
  openAppointmentsOfOrder,
  ORDER_APPOINTMENT_NOTE,
  orderAppointmentStartsAt,
} from "@/domain/appointments/fromOrder";

const appt = (id: string, orderId: string | null, status: AppointmentRecord["status"]): AppointmentRecord => ({
  id,
  tenant_id: "t1",
  customer_id: "c1",
  order_id: orderId,
  type: "DELIVERY",
  starts_at: "2026-10-20T10:00:00.000Z",
  ends_at: null,
  status,
  note: null,
  created_by: null,
  created_at: "2026-10-01T10:00:00.000Z",
  updated_at: "2026-10-01T10:00:00.000Z",
  deleted_at: null,
});

describe("rendez-vous créé avec la commande", () => {
  it("date de livraison + heure locale → instant", () => {
    const iso = orderAppointmentStartsAt("2026-10-20", "10:30");
    expect(iso).not.toBeNull();
    const d = new Date(iso as string);
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 10, 20, 10, 30]);
  });

  it("refuse une date ou une heure invalide", () => {
    expect(orderAppointmentStartsAt(null, "10:00")).toBeNull();
    expect(orderAppointmentStartsAt("", "10:00")).toBeNull();
    expect(orderAppointmentStartsAt("20/10/2026", "10:00")).toBeNull();
    expect(orderAppointmentStartsAt("2026-10-20", "25:00")).toBeNull();
    expect(orderAppointmentStartsAt("2026-10-20", "")).toBeNull();
  });

  it("note sans référence provisoire", () => {
    expect(ORDER_APPOINTMENT_NOTE).not.toMatch(/ORD-/);
  });

  it("le rendez-vous suit la commande", () => {
    expect(appointmentStatusForOrder("DELIVERED")).toBe("COMPLETED");
    expect(appointmentStatusForOrder("CANCELLED")).toBe("CANCELLED");
    expect(appointmentStatusForOrder("SEWING")).toBeNull();
    expect(appointmentStatusForOrder("READY_FOR_PICKUP")).toBeNull();
  });

  it("seuls les rendez-vous ouverts de la commande sont concernés", () => {
    const list = [appt("a1", "o1", "SCHEDULED"), appt("a2", "o1", "CONFIRMED"), appt("a3", "o1", "COMPLETED"), appt("a4", "o2", "SCHEDULED"), appt("a5", null, "SCHEDULED")];
    expect(openAppointmentsOfOrder(list, "o1").map((a) => a.id)).toEqual(["a1", "a2"]);
  });
});
