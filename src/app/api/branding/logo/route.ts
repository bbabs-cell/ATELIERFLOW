import { NextRequest, NextResponse } from "next/server";
import { FileServiceError } from "@/infrastructure/files/fileService";
import { brandingServiceFor } from "@/infrastructure/branding/brandingServer";

/**
 * GET : octets du logo de l'atelier de la session, servis depuis notre
 * domaine pour que le navigateur puisse les intégrer au reçu PDF
 * (le stockage privé n'autorise pas la lecture directe par script).
 * 204 si l'atelier n'a pas de logo.
 */
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const service = await brandingServiceFor(request.headers.get("authorization"));
    const logo = await service.logo();
    if (!logo) return new NextResponse(null, { status: 204 });
    return new NextResponse(logo.bytes as BodyInit, {
      headers: { "content-type": logo.mime, "cache-control": "private, max-age=300" },
    });
  } catch (error) {
    if (error instanceof FileServiceError) {
      return NextResponse.json({ error: { code: error.code } }, { status: error.status });
    }
    return NextResponse.json({ error: { code: "BRANDING_ERROR" } }, { status: 500 });
  }
}
