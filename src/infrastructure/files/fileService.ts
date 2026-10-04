import {
  checkUpload,
  keyBelongsToTenant,
  objectKey,
  SIGNED_URL_TTL_SECONDS,
  sniffMime,
  type FileCategory,
  type FileRecord,
  type FileView,
} from "@/domain/files/files";
import type { R2Storage } from "./r2";

/**
 * Logique de la route /api/files, indépendante de Next et de Supabase
 * (injectés), pour pouvoir la tester. Toujours exécutée pour un
 * utilisateur dont la session a été vérifiée.
 */

/** Accès base de données AU NOM de l'utilisateur (RLS et RPC 0020). */
export interface FilesDb {
  register(input: {
    id: string;
    category: FileCategory;
    entityId: string;
    bucket: string;
    key: string;
    mime: string;
    size: number;
  }): Promise<FileRecord>;
  list(category: FileCategory, entityId: string): Promise<FileRecord[]>;
  /** Toutes les photos d'une catégorie (galerie des modèles), plafonnées. */
  listCategory(category: FileCategory, limit: number): Promise<FileRecord[]>;
  /** Une ligne visible par l'utilisateur (RLS), ou null. */
  get(id: string): Promise<FileRecord | null>;
  remove(id: string): Promise<FileRecord>;
}

export class FileServiceError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}

/** Code d'erreur métier d'une exception Postgres (« NOT_FOUND:customers »…). */
export function dbErrorCode(message: string | undefined): string {
  const match = /(FORBIDDEN:[\w.]+|NOT_FOUND:\w+|VALIDATION:\w+|RECEIPT_IMMUTABLE|ALREADY_ARCHIVED|TOO_MANY_FILES|RATE_LIMITED:\w+|PLAN_(?:LIMIT|FEATURE):\w+)/.exec(message ?? "");
  return match ? match[1] : "DB_ERROR";
}

export function statusForCode(code: string): number {
  if (code.startsWith("FORBIDDEN")) return 403;
  if (code.startsWith("NOT_FOUND")) return 404;
  if (code.startsWith("RATE_LIMITED")) return 429;
  if (code.startsWith("PLAN_")) return 402;
  if (code.startsWith("VALIDATION") || code === "TOO_MANY_FILES") return 422;
  if (code === "ALREADY_ARCHIVED" || code === "RECEIPT_IMMUTABLE") return 409;
  return 500;
}

/** Plafond d'une liste « toute la catégorie ». */
export const MAX_CATEGORY_LIST = 600;

/** Catégories listables en entier (une galerie, pas des fiches). */
export const WHOLE_CATEGORY_LISTS: readonly FileCategory[] = ["MODEL"];

export interface FileServiceDeps {
  tenantId: string;
  storage: R2Storage;
  db: FilesDb;
  uuid?: () => string;
}

function toView(record: FileRecord, url: string): FileView {
  return {
    id: record.id,
    category: record.category,
    entityId: record.entity_id,
    mime: record.mime,
    size: record.size_bytes,
    createdAt: record.created_at,
    url,
  };
}

export function createFileService(deps: FileServiceDeps) {
  const uuid = deps.uuid ?? (() => crypto.randomUUID());

  async function sign(record: FileRecord): Promise<FileView | null> {
    // Défense en profondeur : jamais de lien vers une clé hors de l'atelier.
    if (record.tenant_id !== deps.tenantId || !keyBelongsToTenant(record.key, deps.tenantId)) return null;
    return toView(record, await deps.storage.signedGetUrl(record.key, SIGNED_URL_TTL_SECONDS));
  }

  return {
    async upload(category: FileCategory, entityId: string, bytes: Uint8Array): Promise<FileView> {
      const check = checkUpload(category, bytes);
      if (!check.ok) throw new FileServiceError(check.code, statusForCode(check.code));
      const id = uuid();
      const key = objectKey(deps.tenantId, category, entityId, id, check.mime);

      await deps.storage.put(key, bytes, check.mime);
      let record: FileRecord;
      try {
        record = await deps.db.register({ id, category, entityId, bucket: deps.storage.bucket, key, mime: check.mime, size: bytes.length });
      } catch (error) {
        // Enregistrement refusé (droits, entité d'un autre atelier…) : l'objet ne reste pas.
        await deps.storage.remove(key).catch(() => undefined);
        const code = error instanceof FileServiceError ? error.code : dbErrorCode(error instanceof Error ? error.message : undefined);
        throw new FileServiceError(code, statusForCode(code));
      }
      const view = await sign(record);
      if (!view) throw new FileServiceError("FORBIDDEN:tenant", 403);
      return view;
    },

    async list(category: FileCategory, entityId: string): Promise<FileView[]> {
      const records = await deps.db.list(category, entityId);
      const views = await Promise.all(records.map(sign));
      return views.filter((v): v is FileView => v !== null);
    },

    /** Photos de toute une catégorie (vignettes de la galerie des modèles). */
    async listCategory(category: FileCategory): Promise<FileView[]> {
      const records = await deps.db.listCategory(category, MAX_CATEGORY_LIST);
      const views = await Promise.all(records.map(sign));
      return views.filter((v): v is FileView => v !== null);
    },

    /**
     * Octets d'une photo, servis depuis notre domaine pour que le navigateur
     * puisse les partager (le stockage privé ne se lit pas par script).
     */
    async content(id: string, fetcher: typeof fetch = fetch): Promise<{ bytes: Uint8Array; mime: string }> {
      const record = await deps.db.get(id);
      if (!record || record.deleted_at) throw new FileServiceError("NOT_FOUND:files", 404);
      if (record.purpose !== "PHOTO") throw new FileServiceError("VALIDATION:category", 422);
      const view = await sign(record);
      if (!view) throw new FileServiceError("FORBIDDEN:tenant", 403);
      const response = await fetcher(view.url);
      if (!response.ok) throw new FileServiceError("NOT_FOUND:object", 404);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const mime = sniffMime(bytes);
      if (!mime || mime === "application/pdf") throw new FileServiceError("VALIDATION:mime", 422);
      return { bytes, mime };
    },

    async remove(id: string): Promise<void> {
      try {
        await deps.db.remove(id);
      } catch (error) {
        const code = dbErrorCode(error instanceof Error ? error.message : undefined);
        throw new FileServiceError(code, statusForCode(code));
      }
    },
  };
}
