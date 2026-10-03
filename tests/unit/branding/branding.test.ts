import { describe, expect, it } from "vitest";
import { brandingKey, brandingKeyAllowed, checkBrandingImage, MAX_BRANDING_BYTES } from "@/domain/branding/branding";
import type { R2Storage } from "@/infrastructure/files/r2";
import { createBrandingService, type BrandingDb } from "@/infrastructure/branding/brandingService";

const P = "11111111-1111-4111-8111-111111111111";
const T = "22222222-2222-4222-8222-222222222222";
const F = "33333333-3333-4333-8333-333333333333";
const IDS = { profileId: P, tenantId: T };
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const PDF = new TextEncoder().encode("%PDF-1.7");

function fakeStorage() {
  const objects = new Map<string, Uint8Array>();
  const storage: R2Storage = {
    bucket: "atelier-files",
    async put(key, body) {
      objects.set(key, body);
    },
    async remove(key) {
      objects.delete(key);
    },
    async signedGetUrl(key, ttl) {
      return `https://r2.test/${key}?ttl=${ttl}`;
    },
  };
  return { storage, objects };
}

function fakeDb(state: { avatar: string | null; logo: string | null; cover: string | null }, failWith?: string): BrandingDb {
  return {
    async current() {
      return { ...IDS, ...state };
    },
    async set(kind, key) {
      if (failWith) throw new Error(failWith);
      const field = kind === "AVATAR" ? "avatar" : kind === "LOGO" ? "logo" : "cover";
      const oldKey = state[field];
      state[field] = key;
      return { oldKey };
    },
  };
}

describe("images de personnalisation", () => {
  it("photos uniquement, taille bornée", () => {
    expect(checkBrandingImage(JPEG)).toEqual({ ok: true, mime: "image/jpeg" });
    expect(checkBrandingImage(PDF)).toEqual({ ok: false, code: "VALIDATION:mime" });
    expect(checkBrandingImage(new Uint8Array(MAX_BRANDING_BYTES + 1))).toEqual({ ok: false, code: "VALIDATION:size" });
  });

  it("emplacements : profil pour la photo, atelier pour logo et couverture", () => {
    expect(brandingKey("AVATAR", IDS, F, "image/jpeg")).toBe(`profiles/${P}/avatar-${F}.jpg`);
    expect(brandingKey("LOGO", IDS, F, "image/png")).toBe(`tenants/${T}/branding/logo-${F}.png`);
    expect(brandingKeyAllowed("COVER", `tenants/${T}/branding/cover-x.jpg`, IDS)).toBe(true);
    expect(brandingKeyAllowed("COVER", `tenants/${T}/branding/logo-x.jpg`, IDS)).toBe(false);
    expect(brandingKeyAllowed("AVATAR", `profiles/autre/avatar-x.jpg`, IDS)).toBe(false);
  });

  it("remplacer le logo supprime l'ancien fichier", async () => {
    const { storage, objects } = fakeStorage();
    const old = `tenants/${T}/branding/logo-ancien.png`;
    objects.set(old, JPEG);
    const service = createBrandingService({ storage, db: fakeDb({ avatar: null, logo: old, cover: null }), uuid: () => F });
    const url = await service.upload("LOGO", JPEG);
    expect(url).toBe(`https://r2.test/tenants/${T}/branding/logo-${F}.jpg?ttl=43200`);
    expect(objects.has(old)).toBe(false);
    expect(objects.has(`tenants/${T}/branding/logo-${F}.jpg`)).toBe(true);
  });

  it("refus de la base : l'image envoyée ne reste pas", async () => {
    const { storage, objects } = fakeStorage();
    const service = createBrandingService({ storage, db: fakeDb({ avatar: null, logo: null, cover: null }, "FORBIDDEN:tenant.settings"), uuid: () => F });
    await expect(service.upload("COVER", JPEG)).rejects.toMatchObject({ code: "FORBIDDEN:tenant.settings", status: 403 });
    expect(objects.size).toBe(0);
  });

  it("liens signés seulement pour des clés à leur place", async () => {
    const { storage } = fakeStorage();
    const service = createBrandingService({
      storage,
      db: fakeDb({ avatar: `profiles/${P}/avatar-a.jpg`, logo: `tenants/autre/branding/logo-x.png`, cover: null }),
    });
    expect(await service.urls()).toEqual({ avatar: `https://r2.test/profiles/${P}/avatar-a.jpg?ttl=43200`, logo: null, cover: null });
  });

  it("retirer une image supprime le fichier", async () => {
    const { storage, objects } = fakeStorage();
    const cover = `tenants/${T}/branding/cover-a.jpg`;
    objects.set(cover, JPEG);
    const service = createBrandingService({ storage, db: fakeDb({ avatar: null, logo: null, cover }) });
    await service.remove("COVER");
    expect(objects.size).toBe(0);
  });
});
