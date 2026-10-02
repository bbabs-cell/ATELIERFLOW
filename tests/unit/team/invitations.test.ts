import { describe, expect, it } from "vitest";
import {
  invitationLink,
  invitationMessage,
  mailtoUrl,
  normalizeEmail,
  teamErrorMessage,
  validateInvitationDraft,
  whatsappShareUrl,
} from "@/domain/team/invitations";

describe("invitations — saisie", () => {
  it("normalise l'e-mail et valide le rôle invitable", () => {
    expect(normalizeEmail("  Binta@Atelier.SN ")).toBe("binta@atelier.sn");
    expect(validateInvitationDraft("binta@atelier.sn", "EMPLOYEE")).toEqual({});
    expect(validateInvitationDraft("binta@", "EMPLOYEE").email).toBeDefined();
    expect(validateInvitationDraft("binta@atelier.sn", "OWNER").role).toBeDefined();
  });
});

describe("invitations — partage", () => {
  it("construit le lien sans double barre et encode le jeton", () => {
    expect(invitationLink("https://app.sn/", "ab-c_d")).toBe("https://app.sn/invitation/ab-c_d");
    expect(invitationLink("https://app.sn", "a/b")).toBe("https://app.sn/invitation/a%2Fb");
  });

  it("message, WhatsApp (wa.me) et e-mail préremplis", () => {
    const msg = invitationMessage("Top Couture", "Employé", "https://app.sn/invitation/t");
    expect(msg).toContain("« Top Couture »");
    expect(msg).toContain("comme employé");
    expect(msg).toContain("https://app.sn/invitation/t");
    expect(whatsappShareUrl(msg)).toMatch(/^https:\/\/wa\.me\/\?text=Bonjour/);
    expect(decodeURIComponent(whatsappShareUrl(msg).split("text=")[1])).toBe(msg);
    expect(mailtoUrl("b@a.sn", msg)).toMatch(/^mailto:b%40a\.sn\?subject=/);
  });
});

describe("invitations — erreurs", () => {
  it("traduit les codes levés par la base", () => {
    expect(teamErrorMessage({ message: "EMAIL_MISMATCH" })).toMatch(/autre adresse/);
    expect(teamErrorMessage({ message: "INVITATION_EXPIRED" })).toMatch(/expiré/);
    expect(teamErrorMessage({ message: "FORBIDDEN: team.manage requis" })).toMatch(/réservée/);
    expect(teamErrorMessage({ message: "interdit : un membre ne peut pas se désactiver lui-même" })).toBe(
      "Interdit : un membre ne peut pas se désactiver lui-même",
    );
    expect(teamErrorMessage({ message: "TypeError: Failed to fetch" })).toMatch(/Internet/);
    expect(teamErrorMessage({ message: "relation x does not exist" })).toBe("Une erreur est survenue. Réessayez.");
  });
});
