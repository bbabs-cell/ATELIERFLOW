import type { ActiveSession } from "@/application/auth/session";

/**
 * Dernière identité vérifiée en ligne, conservée pour rouvrir l'application
 * hors connexion (offline-first). Ne contient aucun jeton ni secret : les
 * données restent locales (IndexedDB du tenant) et rien n'est synchronisé
 * tant qu'une session valide n'est pas rétablie.
 */
const KEY = "atelier.lastIdentity";

type StoredIdentity = Pick<ActiveSession, "tenantId" | "profileId" | "email" | "role">;

export function saveLastIdentity(session: ActiveSession): void {
  const value: StoredIdentity = {
    tenantId: session.tenantId,
    profileId: session.profileId,
    email: session.email,
    role: session.role,
  };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // stockage indisponible (navigation privée) : pas de reprise hors ligne.
  }
}

export function loadLastIdentity(): StoredIdentity | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredIdentity>;
    if (typeof parsed.tenantId !== "string" || typeof parsed.profileId !== "string") {
      return null;
    }
    return {
      tenantId: parsed.tenantId,
      profileId: parsed.profileId,
      email: typeof parsed.email === "string" ? parsed.email : null,
      role: typeof parsed.role === "string" ? parsed.role : null,
    };
  } catch {
    return null;
  }
}

export function clearLastIdentity(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // rien à nettoyer
  }
}
