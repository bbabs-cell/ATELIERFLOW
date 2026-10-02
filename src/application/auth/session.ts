/**
 * Session applicative active (phase 10).
 *
 * Source unique du `tenantId` / `profileId` utilisés par les services
 * métier. Elle est posée par l'AuthGate à partir du JWT Supabase (claim
 * `tenant_id`), ou en mode DEMO quand Supabase n'est pas provisionné
 * (développement local : données uniquement dans IndexedDB, rien n'est
 * synchronisé).
 */

export type SessionMode = "SUPABASE" | "OFFLINE" | "DEMO";

export interface ActiveSession {
  tenantId: string;
  profileId: string;
  email: string | null;
  role: string | null;
  /**
   * SUPABASE : session vérifiée en ligne ; OFFLINE : dernière identité
   * connue, réutilisée hors connexion ; DEMO : Supabase non provisionné.
   */
  mode: SessionMode;
}

/** Tenant local du mode DEMO (jamais synchronisé : pas de backend). */
export const DEMO_TENANT_ID = "0171c000-0000-4000-8000-000000000001";
export const DEMO_PROFILE_ID = "0171c000-0000-4000-8000-000000000002";

export function demoSession(): ActiveSession {
  return {
    tenantId: DEMO_TENANT_ID,
    profileId: DEMO_PROFILE_ID,
    email: null,
    role: "OWNER",
    mode: "DEMO",
  };
}

let current: ActiveSession | null = null;
const listeners = new Set<(session: ActiveSession | null) => void>();

export function setActiveSession(session: ActiveSession | null): void {
  current = session;
  for (const listener of listeners) listener(current);
}

export function clearActiveSession(): void {
  setActiveSession(null);
}

export function peekActiveSession(): ActiveSession | null {
  return current;
}

/** Lève si aucune session : aucun service métier ne tourne hors tenant. */
export function getActiveSession(): ActiveSession {
  if (current === null) {
    throw new Error("NO_ACTIVE_SESSION");
  }
  return current;
}

export function subscribeActiveSession(
  listener: (session: ActiveSession | null) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Clé de cache des facades : une instance par (tenant, profil). */
export function sessionKey(session: ActiveSession): string {
  return `${session.tenantId}:${session.profileId}`;
}

/**
 * Mémoïse une fabrique par session : même (tenant, profil) → même instance ;
 * changement d'utilisateur ou d'atelier → nouvelle instance, jamais de
 * mélange de données entre tenants.
 */
export function scopedToSession<T>(
  create: (session: ActiveSession) => T,
): () => T {
  let key: string | null = null;
  let instance: T | null = null;
  return () => {
    const session = getActiveSession();
    const next = sessionKey(session);
    if (instance === null || key !== next) {
      instance = create(session);
      key = next;
    }
    return instance;
  };
}
