import { describe, expect, it } from "vitest";
import {
  buildAppointmentMessage,
  defaultMessageKind,
  relativeDayLabel,
  reminderDue,
} from "@/domain/appointments/messages";
import { countryCodeOf, toWhatsappNumber, whatsappUrl } from "@/domain/messaging/whatsapp";

const TZ = "Africa/Dakar";
const NOW = "2026-10-02T09:00:00.000Z"; // vendredi 2 octobre, 9 h à Dakar

describe("relativeDayLabel", () => {
  it("aujourd'hui, demain, date", () => {
    expect(relativeDayLabel("2026-10-02T17:00:00Z", NOW, TZ)).toBe("aujourd'hui");
    expect(relativeDayLabel("2026-10-03T10:30:00Z", NOW, TZ)).toBe("demain (samedi 3 octobre)");
    expect(relativeDayLabel("2026-10-06T10:30:00Z", NOW, TZ)).toBe("le mardi 6 octobre");
  });

  it("le jour dépend du fuseau de l'atelier", () => {
    // 23 h 30 UTC le 2 = 0 h 30 le 3 à Lagos (UTC+1)
    expect(relativeDayLabel("2026-10-02T23:30:00Z", NOW, "Africa/Lagos")).toBe("demain (samedi 3 octobre)");
    expect(relativeDayLabel("2026-10-02T23:30:00Z", NOW, TZ)).toBe("aujourd'hui");
  });
});

describe("buildAppointmentMessage", () => {
  const base = {
    customerName: "Awa Ndiaye",
    atelierName: "Top Couture",
    atelierAddress: "Médina, Dakar",
    now: NOW,
    timeZone: TZ,
  };

  it("rappel avec prénom, commande, adresse et signature", () => {
    const text = buildAppointmentMessage({
      ...base,
      kind: "REMINDER",
      appointment: { type: "FITTING", starts_at: "2026-10-03T10:30:00Z" },
      orderReference: "ORD-2026-000007",
    });
    expect(text).toBe(
      "Bonjour Awa, petit rappel : votre essayage (commande ORD-2026-000007) chez Top Couture est prévu demain (samedi 3 octobre) à 10:30.\n" +
        "Adresse : Médina, Dakar.\nMerci de nous prévenir en cas d'empêchement.\nTop Couture",
    );
  });

  it("accords en genre et en nombre", () => {
    const at = { starts_at: "2026-10-06T10:00:00Z" };
    expect(buildAppointmentMessage({ ...base, kind: "REMINDER", appointment: { ...at, type: "ALTERATION" } })).toContain("vos retouches chez Top Couture sont prévues le mardi 6 octobre");
    expect(buildAppointmentMessage({ ...base, kind: "CONFIRMATION", appointment: { ...at, type: "MEASUREMENTS" } })).toContain("votre prise de mesures est bien enregistrée pour le mardi 6 octobre à 10:00");
    expect(buildAppointmentMessage({ ...base, kind: "RESCHEDULED", appointment: { ...at, type: "DELIVERY" } })).toContain("la livraison de votre commande a été déplacée : nouveau rendez-vous le mardi 6 octobre");
    expect(buildAppointmentMessage({ ...base, kind: "CANCELLED", appointment: { ...at, type: "ALTERATION" } })).toContain("vos retouches prévues le mardi 6 octobre à 10:00 sont annulées.");
    expect(buildAppointmentMessage({ ...base, kind: "CANCELLED", appointment: { ...at, type: "PICKUP" } })).toContain("le retrait de votre commande prévu le mardi 6 octobre à 10:00 est annulé.");
  });

  it("sans nom ni adresse", () => {
    const text = buildAppointmentMessage({ ...base, customerName: null, atelierAddress: null, kind: "CONFIRMATION", appointment: { type: "OTHER", starts_at: "2026-10-02T15:00:00Z" } });
    expect(text).toBe("Bonjour, votre rendez-vous est bien enregistré pour aujourd'hui à 15:00.\nÀ bientôt !\nTop Couture");
  });
});

describe("reminderDue", () => {
  const appt = (over: Record<string, unknown>) => ({ status: "SCHEDULED" as const, starts_at: "2026-10-03T10:00:00Z", reminder_sent_at: null, ...over });

  it("aujourd'hui ou demain, actif, à venir, pas encore rappelé", () => {
    expect(reminderDue(appt({}), NOW, TZ)).toBe(true);
    expect(reminderDue(appt({ starts_at: "2026-10-02T15:00:00Z", status: "CONFIRMED" }), NOW, TZ)).toBe(true);
    expect(reminderDue(appt({ starts_at: "2026-10-05T10:00:00Z" }), NOW, TZ)).toBe(false);
    expect(reminderDue(appt({ starts_at: "2026-10-02T08:00:00Z" }), NOW, TZ)).toBe(false);
    expect(reminderDue(appt({ reminder_sent_at: "2026-10-02T08:00:00Z" }), NOW, TZ)).toBe(false);
    expect(reminderDue(appt({ status: "CANCELLED" }), NOW, TZ)).toBe(false);
    expect(reminderDue(appt({ status: "NO_SHOW" }), NOW, TZ)).toBe(false);
  });

  it("message par défaut", () => {
    expect(defaultMessageKind({ status: "CANCELLED" })).toBe("CANCELLED");
    expect(defaultMessageKind({ status: "SCHEDULED" })).toBe("REMINDER");
  });
});

describe("numéros WhatsApp", () => {
  it("indicatif de l'atelier", () => {
    expect(countryCodeOf("+221 33 820 00 00")).toBe("221");
    expect(countryCodeOf("00225 07 00 00 00 00")).toBe("225");
    expect(countryCodeOf("+33 6 12 34 56 78")).toBe("33");
    expect(countryCodeOf("77 123 45 67")).toBeNull();
    expect(countryCodeOf(null)).toBeNull();
  });

  it("numéro international, local complété, inexploitable", () => {
    expect(toWhatsappNumber("+221 77 123 45 67")).toBe("221771234567");
    expect(toWhatsappNumber("00221-77-123-45-67")).toBe("221771234567");
    expect(toWhatsappNumber("77 123 45 67", "221")).toBe("221771234567");
    expect(toWhatsappNumber("07 00 00 00 00", "225")).toBe("2250700000000");
    expect(toWhatsappNumber("06 12 34 56 78", "33")).toBe("33612345678");
    expect(toWhatsappNumber("77 123 45 67")).toBeNull();
    expect(toWhatsappNumber("abc", "221")).toBeNull();
    expect(toWhatsappNumber("", "221")).toBeNull();
  });

  it("lien wa.me", () => {
    expect(whatsappUrl("221771234567", "Bonjour à tous")).toBe("https://wa.me/221771234567?text=Bonjour%20%C3%A0%20tous");
    expect(whatsappUrl(null, "x")).toBe("https://wa.me/?text=x");
  });
});
