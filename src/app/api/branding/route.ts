import { NextRequest, NextResponse } from "next/server";
import { isBrandingKind, MAX_BRANDING_BYTES } from "@/domain/branding/branding";
import { FileServiceError } from "@/infrastructure/files/fileService";
import { brandingServiceFor } from "@/infrastructure/branding/brandingServer";

/**
 * Images de personnalisation (0025).
 * GET                         → liens signés (12 h) : photo de profil, logo, couverture.
 * POST multipart {kind, file} → remplace l'image (l'ancienne est supprimée).
 * DELETE ?kind=               → retire l'image.
 */
export const runtime = "nodejs";

function fail(error: unknown) {
  if (error instanceof FileServiceError) {
    return NextResponse.json({ error: { code: error.code } }, { status: error.status });
  }
  return NextResponse.json({ error: { code: "BRANDING_ERROR" } }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    const service = await brandingServiceFor(request.headers.get("authorization"));
    return NextResponse.json(await service.urls(), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const length = Number(request.headers.get("content-length") ?? "0");
    if (length > MAX_BRANDING_BYTES + 64 * 1024) throw new FileServiceError("VALIDATION:size", 413);
    const service = await brandingServiceFor(request.headers.get("authorization"));
    const form = await request.formData().catch(() => null);
    const kind = form?.get("kind");
    const file = form?.get("file");
    if (!isBrandingKind(kind) || !(file instanceof Blob)) throw new FileServiceError("VALIDATION:body", 400);
    const url = await service.upload(kind, new Uint8Array(await file.arrayBuffer()));
    return NextResponse.json({ url }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const kind = request.nextUrl.searchParams.get("kind");
    if (!isBrandingKind(kind)) throw new FileServiceError("VALIDATION:body", 400);
    const service = await brandingServiceFor(request.headers.get("authorization"));
    await service.remove(kind);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return fail(error);
  }
}
