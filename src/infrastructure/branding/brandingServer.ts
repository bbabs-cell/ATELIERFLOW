import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveUserSession } from "@/infrastructure/files/serverContext";
import { createBrandingService, type BrandingDb } from "./brandingService";

function supabaseBrandingDb(client: SupabaseClient): BrandingDb {
  return {
    async current() {
      const { data, error } = await client.rpc("my_branding");
      if (error) throw new Error(error.message);
      const row = (data ?? {}) as Record<string, unknown>;
      const s = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);
      return {
        profileId: String(row.profile_id ?? ""),
        tenantId: String(row.tenant_id ?? ""),
        avatar: s(row.avatar_key),
        logo: s(row.logo_key),
        cover: s(row.cover_key),
      };
    },
    async set(kind, key) {
      const { data, error } = await client.rpc("set_branding_image", { p_kind: kind, p_key: key });
      if (error) throw new Error(error.message);
      const old = (data as Record<string, unknown> | null)?.old_key;
      return { oldKey: typeof old === "string" ? old : null };
    },
  };
}

export async function brandingServiceFor(authorization: string | null) {
  const { client, storage } = await resolveUserSession(authorization);
  return createBrandingService({ storage, db: supabaseBrandingDb(client) });
}
