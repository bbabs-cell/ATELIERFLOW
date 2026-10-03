import "server-only";
import { GALLERY_PER_PAGE, parsePexelsSearch, type GalleryPage } from "@/domain/gallery/gallery";

/**
 * Recherche Pexels côté serveur : la clé (PEXELS_API_KEY) ne quitte jamais
 * le serveur. Les réponses sont gardées en cache un jour par requête et par
 * page, ce qui ménage le quota gratuit (200 requêtes / heure).
 */
export class GalleryError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}

export function getPexelsKey(): string | null {
  return process.env.PEXELS_API_KEY?.trim() || null;
}

export const GALLERY_CACHE_SECONDS = 86_400;

type FetchLike = (input: string, init?: RequestInit & { next?: { revalidate?: number } }) => Promise<Response>;

export async function searchPexels(query: string, page: number, key: string, fetchImpl: FetchLike = fetch): Promise<GalleryPage> {
  const url = new URL("https://api.pexels.com/v1/search");
  url.searchParams.set("query", query);
  url.searchParams.set("page", String(page));
  url.searchParams.set("per_page", String(GALLERY_PER_PAGE));
  url.searchParams.set("orientation", "portrait");
  url.searchParams.set("locale", "fr-FR");

  let response: Response;
  try {
    response = await fetchImpl(url.toString(), {
      headers: { Authorization: key },
      next: { revalidate: GALLERY_CACHE_SECONDS },
    });
  } catch {
    throw new GalleryError("GALLERY_UNAVAILABLE", 502);
  }
  if (response.status === 429) throw new GalleryError("RATE_LIMITED", 429);
  if (response.status === 401 || response.status === 403) throw new GalleryError("GALLERY_NOT_PROVISIONED", 501);
  if (!response.ok) throw new GalleryError("GALLERY_UNAVAILABLE", 502);
  return parsePexelsSearch(await response.json(), query, page);
}
