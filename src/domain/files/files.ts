/**
 * Fichiers privés (prompt 05) — règles pures, partagées par la route
 * serveur et l'interface. Les octets vivent dans Cloudflare R2, la
 * référence dans public.files (0004, 0020).
 *
 * Disposition des objets, indépendante du nom commercial :
 *   tenants/{tenantId}/{customers|orders|fabrics|receipts}/{entityId}/{fileId}.{ext}
 */
import { planErrorMessage } from "@/domain/subscriptions/entitlements";

export const FILE_CATEGORIES = ["CUSTOMER", "ORDER", "FABRIC", "RECEIPT"] as const;
export type FileCategory = (typeof FILE_CATEGORIES)[number];

export const PHOTO_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;
export const PDF_MIME = "application/pdf";
export type AllowedMime = (typeof PHOTO_MIMES)[number] | typeof PDF_MIME;

/** Limites serveur (miroir de register_file, 0020). */
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
export const MAX_PDF_BYTES = 5 * 1024 * 1024;
/** Plafond du corps de requête accepté par la route (hébergeur : ~4,5 Mo). */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const MAX_FILES_PER_ENTITY = 12;
/** Durée de validité des liens de lecture signés. */
export const SIGNED_URL_TTL_SECONDS = 10 * 60;

const DIRS: Record<FileCategory, string> = {
  CUSTOMER: "customers",
  ORDER: "orders",
  FABRIC: "fabrics",
  RECEIPT: "receipts",
};

const EXT: Record<AllowedMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export interface FileRecord {
  id: string;
  tenant_id: string;
  owner_id: string | null;
  category: FileCategory;
  entity_type: string;
  entity_id: string;
  bucket: string;
  key: string;
  mime: string;
  size_bytes: number;
  purpose: "PHOTO" | "PDF";
  created_at: string;
  deleted_at: string | null;
}

/** Fichier tel que renvoyé à l'interface : jamais la clé brute, un lien signé court. */
export interface FileView {
  id: string;
  category: FileCategory;
  entityId: string;
  mime: string;
  size: number;
  createdAt: string;
  url: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function isFileCategory(value: unknown): value is FileCategory {
  return typeof value === "string" && (FILE_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Type réel d'après les premiers octets (signature), jamais d'après le nom
 * ou le type annoncé par le navigateur.
 */
export function sniffMime(bytes: Uint8Array): AllowedMime | null {
  const b = (i: number) => bytes[i];
  if (bytes.length >= 3 && b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return "image/jpeg";
  if (
    bytes.length >= 8 &&
    b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47 &&
    b(4) === 0x0d && b(5) === 0x0a && b(6) === 0x1a && b(7) === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46 &&
    b(8) === 0x57 && b(9) === 0x45 && b(10) === 0x42 && b(11) === 0x50
  ) {
    return "image/webp";
  }
  if (bytes.length >= 5 && b(0) === 0x25 && b(1) === 0x50 && b(2) === 0x44 && b(3) === 0x46 && b(4) === 0x2d) {
    return "application/pdf";
  }
  return null;
}

export type UploadCheck = { ok: true; mime: AllowedMime } | { ok: false; code: string };

/** Contrôle d'un envoi : type réel autorisé pour la catégorie, taille dans les limites. */
export function checkUpload(category: FileCategory, bytes: Uint8Array): UploadCheck {
  if (bytes.length === 0) return { ok: false, code: "VALIDATION:empty" };
  const mime = sniffMime(bytes);
  if (category === "RECEIPT") {
    if (mime !== PDF_MIME) return { ok: false, code: "VALIDATION:mime" };
    if (bytes.length > MAX_PDF_BYTES) return { ok: false, code: "VALIDATION:size" };
    return { ok: true, mime };
  }
  if (mime === null || mime === PDF_MIME) return { ok: false, code: "VALIDATION:mime" };
  if (bytes.length > MAX_PHOTO_BYTES) return { ok: false, code: "VALIDATION:size" };
  return { ok: true, mime };
}

export function objectKey(tenantId: string, category: FileCategory, entityId: string, fileId: string, mime: AllowedMime): string {
  if (!isUuid(tenantId) || !isUuid(entityId) || !isUuid(fileId)) throw new Error("VALIDATION:key");
  return `tenants/${tenantId}/${DIRS[category]}/${entityId}/${fileId}.${EXT[mime]}`;
}

/** Défense en profondeur : on ne signe jamais une clé hors du dossier de l'atelier. */
export function keyBelongsToTenant(key: string, tenantId: string): boolean {
  return isUuid(tenantId) && key.startsWith(`tenants/${tenantId}/`) && !key.includes("..");
}

const MESSAGES: Record<string, string> = {
  UNAUTHENTICATED: "Session expirée : reconnectez-vous.",
  OFFLINE: "Pas de connexion : l'envoi de fichiers nécessite Internet.",
  FILES_NOT_PROVISIONED: "Le stockage des fichiers n'est pas encore activé.",
  "VALIDATION:empty": "Fichier vide.",
  "VALIDATION:mime": "Format non accepté : photo JPEG, PNG ou WebP (PDF pour les reçus).",
  "VALIDATION:size": "Fichier trop lourd.",
  "VALIDATION:body": "Envoi invalide.",
  TOO_MANY_FILES: `Maximum ${MAX_FILES_PER_ENTITY} photos par fiche.`,
  "RATE_LIMITED:files": "Trop d'envois en peu de temps. Réessayez dans une heure.",
  ALREADY_ARCHIVED: "Ce reçu est déjà archivé.",
  RECEIPT_IMMUTABLE: "Un reçu archivé ne peut pas être supprimé.",
  "FORBIDDEN:files.write": "Votre rôle ne permet pas d'ajouter ou de supprimer des fichiers.",
  "FORBIDDEN:files.read": "Votre rôle ne permet pas de consulter les fichiers.",
};

export function fileErrorMessage(code: string | null | undefined): string {
  if (!code) return "L'opération a échoué. Réessayez.";
  const plan = planErrorMessage(code);
  if (plan) return plan;
  if (MESSAGES[code]) return MESSAGES[code];
  if (code.startsWith("NOT_FOUND")) {
    return "Cette fiche n'est pas encore enregistrée sur le serveur (synchronisation en attente) : réessayez dans un instant.";
  }
  if (code.startsWith("FORBIDDEN")) return "Accès refusé.";
  return "L'opération a échoué. Réessayez.";
}
