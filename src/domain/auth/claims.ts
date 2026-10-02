/**
 * Identité de session dérivée du JWT Supabase (phase 10).
 *
 * Le tenant courant vient EXCLUSIVEMENT du claim `tenant_id` posé par le
 * hook GoTrue `custom_access_token_hook` (migration 0011) à partir d'une
 * membership ACTIVE. Aucune valeur saisie côté client ne peut le remplacer.
 * Ce décodage ne vérifie pas la signature : il ne sert qu'à l'affichage et au
 * routage local. L'autorisation réelle reste faite par PostgREST + RLS, qui
 * vérifient le jeton.
 */

export interface SessionClaims {
  sub: string;
  email: string | null;
  tenantId: string | null;
  membershipRole: string | null;
  /** Expiration en secondes epoch, ou null si absente. */
  exp: number | null;
}

export type IdentityResolution =
  | { kind: "READY"; profileId: string; tenantId: string; role: string | null; email: string | null }
  | { kind: "NEEDS_WORKSPACE"; profileId: string; email: string | null }
  | { kind: "INVALID" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function base64UrlDecode(segment: string): string {
  const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function asUuid(value: unknown): string | null {
  return typeof value === "string" && UUID_RE.test(value) ? value : null;
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/** Décode la charge utile d'un JWT ; null si le jeton est mal formé. */
export function decodeSessionClaims(accessToken: string): SessionClaims | null {
  const parts = accessToken.split(".");
  if (parts.length !== 3) return null;
  let payload: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(base64UrlDecode(parts[1]));
    if (typeof parsed !== "object" || parsed === null) return null;
    payload = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  const sub = asUuid(payload.sub);
  if (sub === null) return null;
  return {
    sub,
    email: asText(payload.email),
    tenantId: asUuid(payload.tenant_id),
    membershipRole: asText(payload.membership_role),
    exp: typeof payload.exp === "number" ? payload.exp : null,
  };
}

/**
 * Décide où envoyer l'utilisateur connecté : application (tenant présent)
 * ou création d'atelier (aucune membership ACTIVE, donc aucun claim).
 */
export function resolveIdentity(accessToken: string): IdentityResolution {
  const claims = decodeSessionClaims(accessToken);
  if (claims === null) return { kind: "INVALID" };
  if (claims.tenantId === null) {
    return { kind: "NEEDS_WORKSPACE", profileId: claims.sub, email: claims.email };
  }
  return {
    kind: "READY",
    profileId: claims.sub,
    tenantId: claims.tenantId,
    role: claims.membershipRole,
    email: claims.email,
  };
}
