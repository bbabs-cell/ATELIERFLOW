/**
 * Images de personnalisation (migration 0025) : photo de profil, logo et
 * photo de couverture de l'atelier. Règles pures partagées par la route
 * serveur et l'interface.
 */
import { isUuid, PHOTO_MIMES, sniffMime } from "@/domain/files/files";

export const BRANDING_KINDS = ["AVATAR", "LOGO", "COVER"] as const;
export type BrandingKind = (typeof BRANDING_KINDS)[number];

export const MAX_BRANDING_BYTES = 4 * 1024 * 1024;
/** Liens signés longs : ces images s'affichent sur chaque page. */
export const BRANDING_URL_TTL_SECONDS = 12 * 60 * 60;

/** Réduction côté navigateur avant l'envoi (bord max, en pixels). */
export const BRANDING_MAX_EDGE: Record<BrandingKind, number> = { AVATAR: 512, LOGO: 768, COVER: 1600 };

export const BRANDING_LABELS: Record<BrandingKind, string> = {
  AVATAR: "Photo de profil",
  LOGO: "Logo de l'atelier",
  COVER: "Photo de couverture",
};

export interface BrandingUrls {
  avatar: string | null;
  logo: string | null;
  cover: string | null;
}

export function isBrandingKind(value: unknown): value is BrandingKind {
  return typeof value === "string" && (BRANDING_KINDS as readonly string[]).includes(value);
}

type PhotoMime = (typeof PHOTO_MIMES)[number];
const EXT: Record<PhotoMime, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export function checkBrandingImage(bytes: Uint8Array): { ok: true; mime: PhotoMime } | { ok: false; code: string } {
  if (bytes.length === 0) return { ok: false, code: "VALIDATION:empty" };
  if (bytes.length > MAX_BRANDING_BYTES) return { ok: false, code: "VALIDATION:size" };
  const mime = sniffMime(bytes);
  if (mime === null || mime === "application/pdf") return { ok: false, code: "VALIDATION:mime" };
  return { ok: true, mime };
}

/** Emplacement attendu par set_branding_image (0025). */
export function brandingKey(kind: BrandingKind, ids: { profileId: string; tenantId: string }, fileId: string, mime: PhotoMime): string {
  if (!isUuid(ids.profileId) || !isUuid(ids.tenantId) || !isUuid(fileId)) throw new Error("VALIDATION:key");
  return kind === "AVATAR"
    ? `profiles/${ids.profileId}/avatar-${fileId}.${EXT[mime]}`
    : `tenants/${ids.tenantId}/branding/${kind.toLowerCase()}-${fileId}.${EXT[mime]}`;
}

/** Clé lue en base acceptable pour un lien signé (défense en profondeur). */
export function brandingKeyAllowed(kind: BrandingKind, key: string, ids: { profileId: string; tenantId: string }): boolean {
  if (key.includes("..")) return false;
  return kind === "AVATAR"
    ? key.startsWith(`profiles/${ids.profileId}/avatar-`)
    : key.startsWith(`tenants/${ids.tenantId}/branding/${kind.toLowerCase()}-`);
}

const MESSAGES: Record<string, string> = {
  UNAUTHENTICATED: "Session expirée : reconnectez-vous.",
  OFFLINE: "Pas de connexion : l'envoi d'une image nécessite Internet.",
  FILES_NOT_PROVISIONED: "L'envoi d'images n'est pas encore activé.",
  "VALIDATION:empty": "Image vide.",
  "VALIDATION:mime": "Format non accepté : JPEG, PNG ou WebP.",
  "VALIDATION:size": "Image trop lourde (4 Mo maximum).",
  "FORBIDDEN:tenant.settings": "Seul le propriétaire de l'atelier peut changer le logo et la couverture.",
};

export function brandingErrorMessage(code: string | null | undefined): string {
  if (code && MESSAGES[code]) return MESSAGES[code];
  return typeof navigator !== "undefined" && !navigator.onLine ? "Connexion Internet requise." : "L'envoi a échoué. Réessayez.";
}
