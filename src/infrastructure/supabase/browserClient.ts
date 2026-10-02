import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBrowserEnv } from "./env";

/**
 * Client Supabase navigateur (clé anon publique uniquement).
 *
 * La session est persistée dans le stockage local par supabase-js : elle
 * survit au rechargement et à la coupure réseau (offline-first). Le jeton
 * est rafraîchi automatiquement quand le réseau revient.
 * `null` quand Supabase n'est pas provisionné (mode DEMO local).
 */
let client: SupabaseClient | null | undefined;

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (client !== undefined) return client;
  const env = getSupabaseBrowserEnv();
  if (!env.provisioned || typeof window === "undefined") {
    client = null;
    return client;
  }
  client = createClient(env.url, env.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: "atelier-auth",
    },
  });
  return client;
}

/** Jeton d'accès courant, ou null sans session. */
export async function getAccessToken(): Promise<string | null> {
  const supabase = getSupabaseBrowserClient();
  if (supabase === null) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
