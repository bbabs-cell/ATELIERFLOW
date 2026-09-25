import { describe, expect, it } from "vitest";
import {
  APPOINTMENT_TRANSITIONS,
  appointmentAfterTransition,
  appointmentDayISO,
  appointmentTimeLabel,
  canTransitionAppointment,
  validateAppointmentDraft,
} from "@/domain/appointments/appointments";
import { validateNotificationDraft } from "@/domain/appointments/notifications";

function localDateTime(year: number, month: number, day: number, hour = 9, minute = 0) {
  return new Date(year, month - 1, day, hour, minute).toISOString();
}

describe("validateAppointmentDraft", () => {
  it("accepte un rendez-vous valide et nettoie les champs", () => {
    const draft = validateAppointmentDraft({
      customerId: "  c1  ",
      type: "FITTING",
      startsAt: localDateTime(2026, 9, 28, 10, 0),
      endsAt: localDateTime(2026, 9, 28, 11, 0),
      note: "  ",
    });
    expect(draft.errors).toEqual({});
    expect(draft.value.customerId).toBe("c1");
    expect(draft.value.endsAt).toBe(localDateTime(2026, 9, 28, 11, 0));
    expect(draft.value.note).toBeNull();
  });

  it("vide la fin de créneau si elle est absente", () => {
    const draft = validateAppointmentDraft({
      customerId: "c1",
      type: "OTHER",
      startsAt: localDateTime(2026, 9, 28, 10, 0),
      endsAt: "",
    });
    expect(draft.errors).toEqual({});
    expect(draft.value.endsAt).toBeNull();
  });

  it("exige le client et un type connu", () => {
    const draft = validateAppointmentDraft({
      customerId: "",
      type: "CAPTURE_HALL",
      startsAt: localDateTime(2026, 9, 28, 10, 0),
    });
    expect(draft.errors.customerId).toBe("Le client est requis.");
    expect(draft.errors.type).toBeTruthy();
  });

  it("refuse les dates invalides ou une fin avant le début", () => {
    const badStart = validateAppointmentDraft({
      customerId: "c1",
      type: "OTHER",
      startsAt: "pas-une-date",
    });
    expect(badStart.errors.startsAt).toBeTruthy();

    const badEnd = validateAppointmentDraft({
      customerId: "c1",
      type: "OTHER",
      startsAt: localDateTime(2026, 9, 28, 10, 0),
      endsAt: localDateTime(2026, 9, 28, 9, 0),
    });
    expect(badEnd.errors.endsAt).toContain("après");
  });
});

describe("transitions de rendez-vous", () => {
  it("autorise l'avancement réel et bloque les retours", () => {
    expect(canTransitionAppointment("SCHEDULED", "CONFIRMED")).toBe(true);
    expect(canTransitionAppointment("CONFIRMED", "COMPLETED")).toBe(true);
    expect(canTransitionAppointment("COMPLETED", "SCHEDULED")).toBe(false);
    expect(canTransitionAppointment("NO_SHOW", "COMPLETED")).toBe(true);
  });

  it("refuse un statut inconnu", () => {
    expect(canTransitionAppointment("SCHEDULED", "NOPE")).toBe(false);
    expect(canTransitionAppointment("NOPE", "COMPLETED")).toBe(false);
  });

  it("la matrice couvre tous les statuts", () => {
    expect(Object.keys(APPOINTMENT_TRANSITIONS)).toEqual([
      "SCHEDULED",
      "CONFIRMED",
      "COMPLETED",
      "CANCELLED",
      "NO_SHOW",
    ]);
  });

  it("appointmentAfterTransition met à jour statut et updated_at", () => {
    const record = {
      id: "a1",
      tenant_id: "t1",
      customer_id: "c1",
      order_id: null,
      type: "FITTING" as const,
      starts_at: localDateTime(2026, 9, 28, 10, 0),
      ends_at: null,
      status: "SCHEDULED" as const,
      note: null,
      created_by: null,
      created_at: "2026-01-01T08:00:00.000Z",
      updated_at: "2026-01-01T08:00:00.000Z",
      deleted_at: null,
    };
    const updated = appointmentAfterTransition(
      record,
      "CONFIRMED",
      "2026-09-28T12:00:00.000Z",
    );
    expect(updated.status).toBe("CONFIRMED");
    expect(updated.updated_at).toBe("2026-09-28T12:00:00.000Z");
    expect(updated.id).toBe("a1");
  });
});

describe("helpers de créneau", () => {
  it("découpe jour et heure locaux", () => {
    const starts = localDateTime(2026, 9, 28, 14, 30);
    expect(appointmentDayISO(starts)).toBe("2026-09-28");
    expect(appointmentTimeLabel(starts)).toBe("14:30");
  });
});

describe("validateNotificationDraft", () => {
  it("accepte une notification WhatsApp propre", () => {
    const draft = validateNotificationDraft({
      type: "APPOINTMENT_REMINDER",
      channel: "WHATSAPP",
      title: "  Rappel  ",
      body: "",
    });
    expect(draft.errors).toEqual({});
    expect(draft.value.title).toBe("Rappel");
    expect(draft.value.body).toBeNull();
  });

  it("refuse un canal inconnu ou un titre vide", () => {
    const draft = validateNotificationDraft({
      type: "APPOINTMENT_REMINDER",
      channel: "SMS",
      title: "",
    });
    expect(draft.errors.channel).toBe("Canal invalide.");
    expect(draft.errors.title).toBeTruthy();
  });
});