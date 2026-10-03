import { NextResponse, type NextRequest } from "next/server";
import { normalizeGalleryPage, normalizeGalleryQuery } from "@/domain/gallery/gallery";
import { verifySessionTenant } from "@/infrastructure/auth/verifySession";
import { GalleryError, getPexelsKey, searchPexels } from "@/infrastructure/gallery/pexels";

/**
 * GET /api/gallery?q=…&page=… — recherche de modèles (Pexels) pour un
 * membre connecté d'un atelier. La clé Pexels reste sur le serveur.
 */
export const dynamic = "force-dynamic";

function fail(code: string, status: number) {
  return NextResponse.json({ error: { code } }, { status, headers: { "cache-control": "no-store" } });
}

export async function GET(request: NextRequest) {
  const key = getPexelsKey();
  if (!key) return fail("GALLERY_NOT_PROVISIONED", 501);

  const session = await verifySessionTenant(request.headers.get("authorization"));
  if (!session) return fail("UNAUTHENTICATED", 401);

  const query = normalizeGalleryQuery(request.nextUrl.searchParams.get("q"));
  if (!query) return fail("VALIDATION:query", 400);
  const page = normalizeGalleryPage(request.nextUrl.searchParams.get("page"));

  try {
    const result = await searchPexels(query, page, key);
    return NextResponse.json(result, { headers: { "cache-control": "private, max-age=3600" } });
  } catch (error) {
    if (error instanceof GalleryError) return fail(error.code, error.status);
    return fail("GALLERY_UNAVAILABLE", 502);
  }
}
