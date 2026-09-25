/**
 * Configuration Supabase (phase 04).
 *
 * Runtime-née : uniquement `NEXT_PUBLIC_*` est embarqué côté client (la clé
 * anon est publique par nature). Les clés serveur (`service_role`) ne sont
 * jamais importées depuis du code client — elles restent au niveau de l'API
 * route / du serveur.
 */

const ENV = typeof process === "undefined" ? ({} as NodeJS.ProcessEnv) : process.env;

export const REQUIRED_BROWSER_ENV = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] as const;

export interface SupabaseBrowserEnv {
  url: string;
  anonKey: string;
  provisioned: boolean;
}

export interface SupabaseServerEnv extends SupabaseBrowserEnv {
  serviceRoleKey: string | null;
}

function parseUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? value : null;
  } catch {
    return null;
  }
}

export function getSupabaseBrowserEnv(): SupabaseBrowserEnv {
  const url = parseUrl(ENV.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || null;
  const provisioned = url !== null && anonKey !== null;
  return {
    url: url ?? "",
    anonKey: anonKey ?? "",
    provisioned,
  };
}

/**
 * Côté serveur uniquement. `serviceRoleKey` est optionnel : le relais
 * `/api/sync` n'en a pas besoin (il relaie la session de l'utilisateur).
 */
export function getSupabaseServerEnv(): SupabaseServerEnv {
  const base = getSupabaseBrowserEnv();
  const serviceRoleKey = ENV.SUPABASE_SERVICE_ROLE_KEY?.trim() || null;
  return { ...base, serviceRoleKey };
}

export function getMissingBrowserEnv(): string[] {
  return REQUIRED_BROWSER_ENV.filter(
    (key) => !ENV[key]?.trim(),
  );
}