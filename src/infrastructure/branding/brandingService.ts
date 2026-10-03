import {
  BRANDING_URL_TTL_SECONDS,
  brandingKey,
  brandingKeyAllowed,
  checkBrandingImage,
  type BrandingKind,
  type BrandingUrls,
} from "@/domain/branding/branding";
import { FileServiceError, statusForCode } from "@/infrastructure/files/fileService";
import type { R2Storage } from "@/infrastructure/files/r2";

/** Accès base au nom de l'utilisateur (RPC de 0025). */
export interface BrandingDb {
  current(): Promise<{ profileId: string; tenantId: string; avatar: string | null; logo: string | null; cover: string | null }>;
  set(kind: BrandingKind, key: string | null): Promise<{ oldKey: string | null }>;
}

function codeOf(error: unknown): string {
  const match = /((?:FORBIDDEN|VALIDATION):[\w.]+|UNAUTHENTICATED)/.exec(error instanceof Error ? error.message : "");
  return match ? match[1] : "DB_ERROR";
}

/**
 * Logique de /api/branding, indépendante de Next et de Supabase : l'image
 * est rangée dans R2, la base n'enregistre que sa clé (et vérifie
 * l'emplacement), l'ancienne image est supprimée.
 */
export function createBrandingService(deps: { storage: R2Storage; db: BrandingDb; uuid?: () => string }) {
  const uuid = deps.uuid ?? (() => crypto.randomUUID());

  async function sign(kind: BrandingKind, key: string | null, ids: { profileId: string; tenantId: string }) {
    if (!key || !brandingKeyAllowed(kind, key, ids)) return null;
    return deps.storage.signedGetUrl(key, BRANDING_URL_TTL_SECONDS);
  }

  return {
    async urls(): Promise<BrandingUrls> {
      const cur = await deps.db.current();
      const [avatar, logo, cover] = await Promise.all([
        sign("AVATAR", cur.avatar, cur),
        sign("LOGO", cur.logo, cur),
        sign("COVER", cur.cover, cur),
      ]);
      return { avatar, logo, cover };
    },

    async upload(kind: BrandingKind, bytes: Uint8Array): Promise<string> {
      const check = checkBrandingImage(bytes);
      if (!check.ok) throw new FileServiceError(check.code, check.code === "VALIDATION:size" ? 413 : 422);
      const ids = await deps.db.current();
      const key = brandingKey(kind, ids, uuid(), check.mime);
      await deps.storage.put(key, bytes, check.mime);
      let oldKey: string | null;
      try {
        ({ oldKey } = await deps.db.set(kind, key));
      } catch (error) {
        await deps.storage.remove(key).catch(() => undefined);
        const code = codeOf(error);
        throw new FileServiceError(code, statusForCode(code));
      }
      if (oldKey && oldKey !== key && brandingKeyAllowed(kind, oldKey, ids)) await deps.storage.remove(oldKey).catch(() => undefined);
      return deps.storage.signedGetUrl(key, BRANDING_URL_TTL_SECONDS);
    },

    async remove(kind: BrandingKind): Promise<void> {
      const ids = await deps.db.current();
      let oldKey: string | null;
      try {
        ({ oldKey } = await deps.db.set(kind, null));
      } catch (error) {
        const code = codeOf(error);
        throw new FileServiceError(code, statusForCode(code));
      }
      if (oldKey && brandingKeyAllowed(kind, oldKey, ids)) await deps.storage.remove(oldKey).catch(() => undefined);
    },
  };
}
