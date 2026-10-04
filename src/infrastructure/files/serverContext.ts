import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { decodeSessionClaims } from "@/domain/auth/claims";
import type { FileCategory, FileRecord } from "@/domain/files/files";
import { getSupabaseServerEnv } from "@/infrastructure/supabase/env";
import { FileServiceError, type FilesDb } from "./fileService";
import { createR2Storage, getR2Env, type R2Storage } from "./r2";

/**
 * Contexte d'une requête /api/files : session Supabase VÉRIFIÉE auprès de
 * GoTrue (pas seulement décodée), atelier issu du JWT, client Supabase
 * agissant au nom de l'utilisateur (RLS et RPC 0020), stockage R2.
 */
export interface FilesContext {
  tenantId: string;
  storage: R2Storage;
  db: FilesDb;
}

const ENTITY_TYPES: Record<FileCategory, string> = {
  CUSTOMER: "customers",
  ORDER: "orders",
  FABRIC: "fabrics",
  RECEIPT: "receipts",
  MODEL: "design_models",
};

function supabaseFilesDb(client: SupabaseClient): FilesDb {
  return {
    async register(input) {
      const { data, error } = await client.rpc("register_file", {
        p_id: input.id,
        p_category: input.category,
        p_entity_id: input.entityId,
        p_bucket: input.bucket,
        p_key: input.key,
        p_mime: input.mime,
        p_size: input.size,
      });
      if (error) throw new Error(error.message);
      return data as FileRecord;
    },
    async list(category, entityId) {
      const { data, error } = await client
        .from("files")
        .select("*")
        .eq("entity_type", ENTITY_TYPES[category])
        .eq("entity_id", entityId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as FileRecord[];
    },
    async listCategory(category, limit) {
      const { data, error } = await client
        .from("files")
        .select("*")
        .eq("entity_type", ENTITY_TYPES[category])
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(limit);
      if (error) throw new Error(error.message);
      return (data ?? []) as FileRecord[];
    },
    async get(id) {
      const { data, error } = await client.from("files").select("*").eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as FileRecord | null;
    },
    async remove(id) {
      const { data, error } = await client.rpc("delete_file", { p_id: id });
      if (error) throw new Error(error.message);
      return data as FileRecord;
    },
  };
}

/** Session vérifiée : atelier du JWT et client Supabase agissant au nom de l'utilisateur. */
export interface UserSessionContext {
  tenantId: string;
  client: SupabaseClient;
  storage: R2Storage;
}

export async function resolveUserSession(authorization: string | null): Promise<UserSessionContext> {
  const env = getSupabaseServerEnv();
  const r2 = getR2Env();
  if (!env.provisioned || r2 === null) throw new FileServiceError("FILES_NOT_PROVISIONED", 501);
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) throw new FileServiceError("UNAUTHENTICATED", 401);

  const client = createClient(env.url, env.anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new FileServiceError("UNAUTHENTICATED", 401);
  const claims = decodeSessionClaims(token);
  if (!claims?.tenantId || claims.sub !== data.user.id) throw new FileServiceError("FORBIDDEN:tenant", 403);

  return { tenantId: claims.tenantId, client, storage: createR2Storage(r2) };
}

export async function resolveFilesContext(authorization: string | null): Promise<FilesContext> {
  const { tenantId, client, storage } = await resolveUserSession(authorization);
  return { tenantId, storage, db: supabaseFilesDb(client) };
}
