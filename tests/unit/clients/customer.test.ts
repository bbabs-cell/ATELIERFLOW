import { describe, expect, it } from "vitest";
import {
  archiveCustomer,
  isActive,
  matchesSearch,
  normalizeContact,
  normalizeEmail,
  normalizeFullName,
  normalizePhone,
  samePhoneWithinTenant,
  validEmail,
} from "@/domain/clients/customer";

function baseCustomer(overrides: Record<string, unknown> = {}) {
  return {
    id: "c1",
    tenant_id: "t1",
    full_name: "Awa Diop",
    phone: "+221771234567",
    whatsapp: null,
    email: null,
    address: null,
    notes: null,
    photo_key: null,
    status: "ACTIVE",
    created_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    deleted_at: null,
    ...overrides,
  } as const;
}

describe("normalizeFullName", () => {
  it("réduit les espaces multiples", () => {
    expect(normalizeFullName("  Awa   Diop  ")).toBe("Awa Diop");
  });
});

describe("normalizePhone / email / search", () => {
  it("nettoie un numéro de téléphone", () => {
    expect(normalizePhone("+221 77 123 45 67")).toBe("+221771234567");
    expect(normalizePhone("77.123.45.67")).toBe("771234567");
  });

  it("normalise un email en minuscules", () => {
    expect(normalizeEmail("  Awa@Exemple.FR ")).toBe("awa@exemple.fr");
  });

  it("valide les emails", () => {
    expect(validEmail("awa@exemple.fr")).toBe(true);
    expect(validEmail("awa@@exemple.fr")).toBe(false);
    expect(validEmail("awa@exemple")).toBe(false);
  });
});

describe("normalizeContact", () => {
  it("accepte un contact valide et normalise", () => {
    const r = normalizeContact({
      full_name: "  Awa   Diop ",
      phone: "+221 77 123 45 67",
      email: " Awa@Exemple.FR ",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.full_name).toBe("Awa Diop");
      expect(r.value.phone).toBe("+221771234567");
      expect(r.value.email).toBe("awa@exemple.fr");
    }
  });

  it("rejette un nom trop court", () => {
    const r = normalizeContact({ full_name: "A" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.full_name).toBeTruthy();
  });

  it("rejette un téléphone non chiffre", () => {
    const r = normalizeContact({ full_name: "Awa", phone: "0123-abc" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.phone).toBeTruthy();
  });

  it("rejette un email invalide", () => {
    const r = normalizeContact({ full_name: "Awa", email: "mauvais" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.email).toBeTruthy();
  });
});

describe("matchesSearch", () => {
  it("matche sur le nom et le téléphone, insensible à la casse", () => {
    const c = baseCustomer();
    expect(matchesSearch(c, "awa")).toBe(true);
    expect(matchesSearch(c, "7712")).toBe(true);
    expect(matchesSearch(c, "inconnu")).toBe(false);
  });
});

describe("archiveCustomer", () => {
  it("archive (soft delete) et met à jour updated_at", () => {
    const archived = archiveCustomer(baseCustomer(), "2026-02-01T00:00:00.000Z");
    expect(archived.status).toBe("ARCHIVED");
    expect(archived.updated_at).toBe("2026-02-01T00:00:00.000Z");
    expect(archived.id).toBe("c1");
  });
});

describe("samePhoneWithinTenant", () => {
  it("élimine les doublons de téléphone actifs", () => {
    const a = baseCustomer({ phone: "771234567" });
    const b = baseCustomer({ id: "c2", phone: "771234567" });
    expect(samePhoneWithinTenant(a, b)).toBe(true);
  });

  it("ignore les clients archivés", () => {
    const a = baseCustomer({ phone: "771234567" });
    const archived = baseCustomer({ id: "c2", phone: "771234567", status: "ARCHIVED" });
    expect(samePhoneWithinTenant(a, archived)).toBe(false);
    expect(isActive(archived)).toBe(false);
  });
});