import { NextRequest, NextResponse } from "next/server";
import { getMissingBrowserEnv, getSupabaseServerEnv } from "@/infrastructure/supabase/env";
import {
  validateSyncPushBody,
  relaySyncPush,
  SyncRelayError,
} from "@/infrastructure/sync/syncRelay";

/**
 * Passerelle de synchronisation (phase 04).
 *
 * Reçoit les lots offline-first du PWA et les relaie au RPC `sync_push` via
 * la session JWT de l'utilisateur. Aucun secret n'est embarqué (clé anon
 * publique seulement) ; le tenant est résolu côté base par `auth.uid()`.
 *
 * Non provisionné → 501 explicite : le client file les opérations et les
 * requeue — il n'y a jamais de faux backend.
 */
export async function POST(request: NextRequest) {
  if (getMissingBrowserEnv().length > 0) {
    return NextResponse.json(
      {
        error: {
          code: "SYNC_ENDPOINT_NOT_PROVISIONED",
          message: "Supabase non provisionné.",
        },
      },
      { status: 501 },
    );
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: "Session requise." } },
      { status: 401 },
    );
  }

  let body;
  try {
    const raw = (await request.json()) as unknown;
    body = validateSyncPushBody(raw);
  } catch (error) {
    if (error instanceof SyncRelayError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: { code: "SYNC_BODY_INVALID", message: "Corps de requête invalide." } },
      { status: 400 },
    );
  }

  const env = getSupabaseServerEnv();
  try {
    const response = await relaySyncPush(
      { url: env.url, anonKey: env.anonKey },
      authorization,
      body,
    );
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof SyncRelayError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    const message = error instanceof Error ? error.message : "Relais indisponible.";
    return NextResponse.json(
      { error: { code: "SYNC_RELAY_FAILED", message } },
      { status: 502 },
    );
  }
}