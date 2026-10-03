import { NextResponse } from "next/server";

/**
 * Version déployée (identifiant de build). L'application ouverte compare la
 * sienne à celle-ci pour se recharger quand une nouvelle version est en
 * ligne : une PWA laissée ouverte des jours ne garde pas un ancien code.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { build: process.env.NEXT_PUBLIC_BUILD_ID ?? null },
    { headers: { "cache-control": "no-store" } },
  );
}
