import type { SupabaseClient } from "@supabase/supabase-js";
import type { PullRemote, PullCursorStore } from "@/application/sync/pullService";
import type { PullCursor } from "@/domain/sync/pull";

/**
 * Lecture des tables par l'API REST Supabase, au nom de l'utilisateur :
 * la RLS limite aux lignes de son atelier et à ses permissions.
 * Pagination par (curseur, id) pour ne rien sauter entre deux pages.
 */
export function createSupabasePullRemote(client: SupabaseClient): PullRemote {
  return {
    async fetchPage({ entity, from, after, limit }) {
      const col = entity.cursor;
      let query = client.from(entity.entity).select("*").order(col, { ascending: true }).order("id", { ascending: true }).limit(limit);
      if (after) {
        query = query.or(`${col}.gt."${after.value}",and(${col}.eq."${after.value}",id.gt.${after.id})`);
      } else if (from) {
        query = query.gte(col, from);
      }
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as Record<string, unknown>[];
    },
  };
}

/** Curseurs par atelier, gardés sur l'appareil. */
export function createLocalPullCursorStore(tenantId: string): PullCursorStore {
  const key = (entity: string) => `atelier.pull.${tenantId}.${entity}`;
  return {
    get(entity) {
      try {
        const raw = window.localStorage.getItem(key(entity));
        if (!raw) return null;
        const parsed = JSON.parse(raw) as PullCursor;
        return typeof parsed?.value === "string" && typeof parsed?.id === "string" ? parsed : null;
      } catch {
        return null;
      }
    },
    set(entity, cursor) {
      try {
        window.localStorage.setItem(key(entity), JSON.stringify(cursor));
      } catch {
        // stockage indisponible : relecture complète au prochain passage
      }
    },
  };
}
