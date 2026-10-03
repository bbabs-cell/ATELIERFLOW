import "server-only";
import { createClient } from "@supabase/supabase-js";
import { decodeSessionClaims } from "@/domain/auth/claims";
import { getSupabaseServerEnv } from "@/infrastructure/supabase/env";

/**
 * Vérifie le jeton « Bearer » d'une requête auprès de GoTrue (pas seulement
 * décodé) et renvoie l'atelier du JWT ; null si la session est absente,
 * invalide ou sans atelier.
 */
export async function verifySessionTenant(authorization: string | null): Promise<{ userId: string; tenantId: string } | null> {
  const env = getSupabaseServerEnv();
  if (!env.provisioned) return null;
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) return null;
  const client = createClient(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  const claims = decodeSessionClaims(token);
  if (!claims?.tenantId || claims.sub !== data.user.id) return null;
  return { userId: data.user.id, tenantId: claims.tenantId };
}
