import type { SupabaseClient } from "@supabase/supabase-js";
import type { AtelierIdentity } from "@/domain/orders/receiptDocument";
import { identityFromTenant, mergeReceiptSettings } from "@/domain/tenant/identity";

/**
 * Lecture / écriture des coordonnées de l'atelier (table `tenants`, RLS :
 * lecture par les membres, écriture avec `tenant.settings`). Une copie est
 * gardée sur l'appareil pour émettre des reçus hors connexion.
 */

const CACHE_PREFIX = "atelier.identity.";

export function readCachedIdentity(tenantId: string): AtelierIdentity | null {
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + tenantId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { name?: unknown; settings?: unknown };
    return identityFromTenant(parsed);
  } catch {
    return null;
  }
}

function writeCache(tenantId: string, row: { name: unknown; settings: unknown }): void {
  try {
    window.localStorage.setItem(CACHE_PREFIX + tenantId, JSON.stringify({ name: row.name, settings: row.settings }));
  } catch {
    // stockage indisponible (navigation privée) : on garde la valeur en mémoire seulement
  }
}

/** Mode démo / test : coordonnées gardées sur l'appareil uniquement. */
export function writeCachedIdentity(tenantId: string, identity: AtelierIdentity): void {
  writeCache(tenantId, { name: identity.name, settings: mergeReceiptSettings({}, identity) });
}

export interface AtelierIdentityRemote {
  load(): Promise<AtelierIdentity>;
  save(identity: AtelierIdentity): Promise<AtelierIdentity>;
}

export function createAtelierIdentityRemote(client: SupabaseClient, tenantId: string): AtelierIdentityRemote {
  async function fetchRow() {
    const { data, error } = await client.from("tenants").select("name, settings").eq("id", tenantId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("TENANT_NOT_FOUND");
    return data as { name: unknown; settings: unknown };
  }

  return {
    async load() {
      const row = await fetchRow();
      writeCache(tenantId, row);
      return identityFromTenant(row);
    },
    async save(identity) {
      // Relire juste avant d'écrire : les autres clés de settings sont conservées.
      const current = await fetchRow();
      const settings = mergeReceiptSettings(current.settings, identity);
      const { data, error } = await client
        .from("tenants")
        .update({ name: identity.name, settings })
        .eq("id", tenantId)
        .select("name, settings")
        .maybeSingle();
      if (error) throw new Error(error.message);
      // RLS : sans `tenant.settings`, la mise à jour ne touche aucune ligne.
      if (!data) throw new Error("FORBIDDEN");
      writeCache(tenantId, data as { name: unknown; settings: unknown });
      return identityFromTenant(data as { name: unknown; settings: unknown });
    },
  };
}
