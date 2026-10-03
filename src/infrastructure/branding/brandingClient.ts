import type { BrandingKind, BrandingUrls } from "@/domain/branding/branding";
import { getAccessToken } from "@/infrastructure/supabase/browserClient";

/** Accès navigateur à /api/branding (aucune clé R2 ici). */
export class BrandingError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

async function authHeaders(): Promise<HeadersInit> {
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new BrandingError("OFFLINE");
  const token = await getAccessToken();
  if (!token) throw new BrandingError("UNAUTHENTICATED");
  return { Authorization: `Bearer ${token}` };
}

async function readError(response: Response): Promise<BrandingError> {
  try {
    const body = (await response.json()) as { error?: { code?: string } };
    return new BrandingError(body.error?.code ?? `HTTP_${response.status}`);
  } catch {
    return new BrandingError(`HTTP_${response.status}`);
  }
}

export async function fetchBranding(): Promise<BrandingUrls> {
  const response = await fetch("/api/branding", { headers: await authHeaders(), cache: "no-store" });
  if (!response.ok) throw await readError(response);
  return (await response.json()) as BrandingUrls;
}

export async function uploadBranding(kind: BrandingKind, file: Blob, name: string): Promise<string> {
  const form = new FormData();
  form.set("kind", kind);
  form.set("file", file, name);
  const response = await fetch("/api/branding", { method: "POST", headers: await authHeaders(), body: form });
  if (!response.ok) throw await readError(response);
  return ((await response.json()) as { url: string }).url;
}

export async function removeBranding(kind: BrandingKind): Promise<void> {
  const response = await fetch(`/api/branding?kind=${kind}`, { method: "DELETE", headers: await authHeaders() });
  if (!response.ok) throw await readError(response);
}

/** Logo de l'atelier pour le reçu PDF ; null s'il n'y en a pas ou hors ligne. */
export async function fetchLogoBytes(): Promise<{ bytes: Uint8Array; mime: string } | null> {
  try {
    const response = await fetch("/api/branding/logo", { headers: await authHeaders(), cache: "no-store" });
    if (response.status !== 200) return null;
    const mime = response.headers.get("content-type") ?? "";
    return { bytes: new Uint8Array(await response.arrayBuffer()), mime };
  } catch {
    return null;
  }
}
