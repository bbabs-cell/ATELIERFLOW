/**
 * Configuration Supabase (phase 04).
 *
 * Runtime-née : uniquement `NEXT_PUBLIC_*` est embarqué côté client (la clé
 * anon est publique par nature). Les clés serveur (`service_role`) ne sont
 * jamais importées depuis du code client — elles restent au niveau de l'API
 * route / du serveur.
 */

/*
 * Next.js n'injecte les `NEXT_PUBLIC_*` dans le bundle navigateur que pour
 * des accès LITTÉRAUX `process.env.NEXT_PUBLIC_X` : pas d'alias ni d'accès
 * dynamique, sinon la valeur est toujours absente côté client.
 */
function browserUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_URL;
}

function browserAnonKey(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

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
  const url = parseUrl(browserUrl());
  const anonKey = browserAnonKey()?.trim() || null;
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
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null;
  return { ...base, serviceRoleKey };
}

export function getMissingBrowserEnv(): string[] {
  const values: Record<(typeof REQUIRED_BROWSER_ENV)[number], string | undefined> = {
    NEXT_PUBLIC_SUPABASE_URL: browserUrl(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: browserAnonKey(),
  };
  return REQUIRED_BROWSER_ENV.filter((key) => !values[key]?.trim());
}