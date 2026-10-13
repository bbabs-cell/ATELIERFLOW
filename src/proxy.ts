import { NextResponse, type NextRequest } from "next/server";
import { isForeignOriginWrite } from "@/infrastructure/http/origin";

/**
 * Première barrière des routes /api : une écriture envoyée par la page d'un
 * autre site est refusée avant d'atteindre la route (voir origin.ts).
 */
export function proxy(request: NextRequest) {
  if (isForeignOriginWrite(request.method, request.headers)) {
    return NextResponse.json(
      { error: { code: "FOREIGN_ORIGIN", message: "Requête refusée : elle ne provient pas de ce site." } },
      { status: 403 },
    );
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
