import { NextRequest, NextResponse } from "next/server";
import { isFileCategory, isUuid, MAX_UPLOAD_BYTES } from "@/domain/files/files";
import { createFileService, FileServiceError } from "@/infrastructure/files/fileService";
import { resolveFilesContext } from "@/infrastructure/files/serverContext";

/**
 * Fichiers privés (prompt 05).
 * POST  multipart { category, entityId, file } → envoi dans R2 + enregistrement.
 * GET   ?category=&entityId=                   → fichiers de la fiche, liens signés (10 min).
 * Aucune clé R2 ne quitte le serveur ; l'accès est contrôlé par la session
 * de l'utilisateur (atelier, permissions files.read / files.write).
 */
export const runtime = "nodejs";

function fail(error: unknown) {
  if (error instanceof FileServiceError) {
    return NextResponse.json({ error: { code: error.code } }, { status: error.status });
  }
  return NextResponse.json({ error: { code: "FILES_ERROR" } }, { status: 500 });
}

export async function POST(request: NextRequest) {
  try {
    const length = Number(request.headers.get("content-length") ?? "0");
    if (length > MAX_UPLOAD_BYTES + 64 * 1024) throw new FileServiceError("VALIDATION:size", 413);
    const context = await resolveFilesContext(request.headers.get("authorization"));
    const form = await request.formData().catch(() => null);
    const category = form?.get("category");
    const entityId = form?.get("entityId");
    const file = form?.get("file");
    if (!isFileCategory(category) || !isUuid(entityId) || !(file instanceof Blob)) {
      throw new FileServiceError("VALIDATION:body", 400);
    }
    if (file.size > MAX_UPLOAD_BYTES) throw new FileServiceError("VALIDATION:size", 413);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const view = await createFileService(context).upload(category, entityId, bytes);
    return NextResponse.json({ file: view }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const context = await resolveFilesContext(request.headers.get("authorization"));
    const category = request.nextUrl.searchParams.get("category");
    const entityId = request.nextUrl.searchParams.get("entityId");
    if (!isFileCategory(category) || !isUuid(entityId)) throw new FileServiceError("VALIDATION:body", 400);
    const files = await createFileService(context).list(category, entityId);
    return NextResponse.json({ files }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return fail(error);
  }
}
