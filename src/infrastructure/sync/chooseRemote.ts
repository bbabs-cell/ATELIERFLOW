import type { RemoteSyncPort } from "@/repository/ports/sync";
import { createHttpRemoteSync } from "./remoteHttp";
import { getSupabaseBrowserEnv } from "@/infrastructure/supabase/env";
import { getAccessToken } from "@/infrastructure/supabase/browserClient";

/**
 * Choisit le transport de synchronisation réel, ou un stub explicite
 * (jamais un faux backend).
 *
 * - Provisionné (env Supabase présent) → transport HTTP réel vers `/api/sync`
 *   (la passerelle valide la session et relaie au serveur, phase 04).
 * - Non provisionné → stub qui lève de façon déterministe : chaque push échoue
 *   en `networkError` et l'opération reste en file (requeue), sans simulation.
 */
export function createRemoteSync(): RemoteSyncPort {
  const { provisioned } = getSupabaseBrowserEnv();
  if (provisioned) {
    return createHttpRemoteSync({ getAccessToken });
  }
  return {
    async push() {
      throw new Error("REMOTE_SYNC_NOT_PROVISIONED");
    },
  };
}