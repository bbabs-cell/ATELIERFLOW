import type {
  SyncPushRequest,
  SyncPushResponse,
  SyncWireOperation,
} from "@/domain/sync/types";

export const SYNC_PUSH_RPC: string =
  (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_SYNC_RPC?.trim()) ||
  "sync_push";

/** Erreurs du relais, sérialisées dans l'enveloppe `{ error: { code, message } }`. */
export class SyncRelayError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SyncRelayError";
  }
}

const ALLOWED_OPERATIONS = ["INSERT", "UPDATE", "DELETE"] as const;

export function isPlausibleWireOp(value: unknown): value is SyncWireOperation {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.idempotencyKey === "string" &&
    v.idempotencyKey.length > 0 &&
    typeof v.tenantId === "string" &&
    v.tenantId.length > 0 &&
    typeof v.entity === "string" &&
    v.entity.length > 0 &&
    typeof v.entityId === "string" &&
    v.entityId.length > 0 &&
    typeof v.operation === "string" &&
    (ALLOWED_OPERATIONS as readonly string[]).includes(v.operation) &&
    typeof v.createdAt === "string" &&
    ["object", "null"].includes(typeof v.payload) &&
    v.payload !== undefined &&
    v.payload !== null
  );
}

export function validateSyncPushBody(body: unknown): SyncPushRequest {
  if (typeof body !== "object" || body === null) {
    throw new SyncRelayError(400, "SYNC_BODY_INVALID", "Corps de requête invalide.");
  }
  const { batch } = body as { batch?: unknown };
  if (!Array.isArray(batch) || batch.length === 0) {
    throw new SyncRelayError(400, "SYNC_BATCH_EMPTY", "Aucune opération à synchroniser.");
  }
  if (batch.length > 200) {
    throw new SyncRelayError(400, "SYNC_BATCH_TOO_LARGE", "Lot de synchronisation trop grand.");
  }
  if (!batch.every(isPlausibleWireOp)) {
    throw new SyncRelayError(400, "SYNC_BATCH_INVALID", "Une opération du lot est invalide.");
  }
  return { batch: batch as SyncWireOperation[] };
}

/**
 * Contrat serveur du RPC `sync_push` (migration 0010) :
 *   { "results": [ { "idempotencyKey": "uuid",
 *                     "outcome": { "kind": "SYNCED", "record"?: {...} }
 *                              | { "kind": "FAILED", "error": "..." }
 *                              | { "kind": "CONFLICT", "reason": "..." } } ] }
 */
export interface RpcResponse {
  data: unknown;
  error?: { code?: string; message: string } | null;
}

export function mapSyncPushRpc(
  rpc: RpcResponse,
  request: SyncPushRequest,
): SyncPushResponse {
  if (rpc.error) {
    throw new SyncRelayError(
      502,
      rpc.error.code ?? "SYNC_RELAY_UPSTREAM",
      rpc.error.message ?? "Le serveur de synchronisation a échoué.",
    );
  }

  const payload = rpc.data as {
    results?: Array<{
      idempotencyKey?: string;
      outcome?: { kind?: string; record?: unknown; error?: string; reason?: string };
    }>;
  } | null;

  if (!payload || !Array.isArray(payload.results)) {
    throw new SyncRelayError(502, "SYNC_RELAY_BAD_RESPONSE", "Réponse du serveur incomplète.");
  }

  const byKey = new Map(
    payload.results
      .filter((r) => typeof r.idempotencyKey === "string")
      .map((r) => [r.idempotencyKey as string, r.outcome]),
  );

  const results: SyncPushResponse["results"] = [];
  for (const op of request.batch) {
    const outcome = byKey.get(op.idempotencyKey);
    if (!outcome) continue;
    if (outcome.kind === "SYNCED") {
      results.push({
        idempotencyKey: op.idempotencyKey,
        outcome: { kind: "SYNCED", record: outcome.record },
      });
    } else if (outcome.kind === "CONFLICT") {
      results.push({
        idempotencyKey: op.idempotencyKey,
        outcome: { kind: "CONFLICT", reason: outcome.reason ?? "Conflit." },
      });
    } else if (outcome.kind === "FAILED") {
      results.push({
        idempotencyKey: op.idempotencyKey,
        outcome: { kind: "FAILED", error: outcome.error ?? "Échec." },
      });
    }
  }
  return { results };
}

export interface SupabaseRestEnv {
  url: string;
  anonKey: string;
}

/**
 * Relaie un lot vers le RPC `sync_push` en propageant la session
 * `Authorization` de l'utilisateur : PostgREST résout alors `auth.uid()/jwt`
 * côté serveur, et le RPC (security definer) re-force l'appartenance au
 * tenant — le relais ne manipule aucune clé de service.
 */
export async function relaySyncPush(
  env: SupabaseRestEnv,
  authorization: string,
  request: SyncPushRequest,
  fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<SyncPushResponse> {
  const endpoint = `${env.url.replace(/\/$/, "")}/rest/v1/rpc/${SYNC_PUSH_RPC}`;
  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        apikey: env.anonKey,
        authorization,
        "content-type": "application/json",
      },
      body: JSON.stringify({ p_batch: request.batch }),
    });
  } catch (error) {
    throw new SyncRelayError(
      0,
      "NETWORK_UNAVAILABLE",
      error instanceof Error ? error.message : "Réseau indisponible.",
    );
  }

  let parsed: unknown = null;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const body = (parsed ?? {}) as { code?: string; message?: string; details?: unknown };
    throw new SyncRelayError(
      response.status,
      body.code ?? "SYNC_RELAY_UPSTREAM",
      body.message ?? `Le serveur de synchronisation a répondu ${response.status}.`,
    );
  }

  return mapSyncPushRpc({ data: parsed, error: null }, request);
}