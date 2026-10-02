import { NextRequest, NextResponse } from "next/server";
import { isUuid } from "@/domain/files/files";
import { createFileService, FileServiceError } from "@/infrastructure/files/fileService";
import { resolveFilesContext } from "@/infrastructure/files/serverContext";

/** DELETE : suppression LOGIQUE d'une photo (un reçu archivé est refusé). */
export const runtime = "nodejs";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!isUuid(id)) throw new FileServiceError("VALIDATION:body", 400);
    const context = await resolveFilesContext(request.headers.get("authorization"));
    await createFileService(context).remove(id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof FileServiceError) {
      return NextResponse.json({ error: { code: error.code } }, { status: error.status });
    }
    return NextResponse.json({ error: { code: "FILES_ERROR" } }, { status: 500 });
  }
}
