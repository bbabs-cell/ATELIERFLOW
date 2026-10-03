import type { GalleryPage } from "@/domain/gallery/gallery";
import { getAccessToken } from "@/infrastructure/supabase/browserClient";

/** Accès navigateur à /api/gallery (aucune clé Pexels ici). */
export class GalleryClientError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export async function searchGallery(query: string, page: number, signal?: AbortSignal): Promise<GalleryPage> {
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new GalleryClientError("OFFLINE");
  const token = await getAccessToken();
  if (!token) throw new GalleryClientError("UNAUTHENTICATED");
  const params = new URLSearchParams({ q: query, page: String(page) });
  let response: Response;
  try {
    response = await fetch(`/api/gallery?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` }, signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new GalleryClientError(typeof navigator !== "undefined" && !navigator.onLine ? "OFFLINE" : "NETWORK");
  }
  if (!response.ok) {
    let code = `HTTP_${response.status}`;
    try {
      code = ((await response.json()) as { error?: { code?: string } }).error?.code ?? code;
    } catch {
      // corps illisible : code HTTP
    }
    throw new GalleryClientError(code);
  }
  return (await response.json()) as GalleryPage;
}
