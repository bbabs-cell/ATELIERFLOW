import { NextResponse } from "next/server";
import { PEGGED_RATES, sanitizeRates } from "@/domain/geo/exchange";

/**
 * Taux du jour depuis le F CFA (XOF), pour l'affichage indicatif des prix
 * des plans. Mis en cache 6 h côté serveur ; en cas d'indisponibilité du
 * service, seules les parités fixes (€, F CFA CEMAC, FC comorien) sont
 * renvoyées. Aucune donnée personnelle, aucune clé.
 */
export const revalidate = 21600;

export async function GET() {
  try {
    const response = await fetch("https://open.er-api.com/v6/latest/XOF", { next: { revalidate } });
    if (!response.ok) throw new Error(String(response.status));
    const body = (await response.json()) as { result?: string; rates?: unknown; time_last_update_utc?: string };
    if (body.result !== "success") throw new Error("RATES_UNAVAILABLE");
    return NextResponse.json(
      { base: "XOF", rates: sanitizeRates(body.rates), updatedAt: body.time_last_update_utc ?? null },
      { headers: { "cache-control": "public, max-age=3600, s-maxage=21600" } },
    );
  } catch {
    return NextResponse.json({ base: "XOF", rates: PEGGED_RATES, updatedAt: null }, { headers: { "cache-control": "public, max-age=600" } });
  }
}
