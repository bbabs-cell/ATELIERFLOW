import { describe, expect, it } from "vitest";
import {
  isPlausibleWireOp,
  mapSyncPushRpc,
  relaySyncPush,
  validateSyncPushBody,
  SyncRelayError,
} from "@/infrastructure/sync/syncRelay";
import type { SyncWireOperation } from "@/domain/sync/types";

const ENV = { url: "https://abc.supabase.co", anonKey: "pk_anon" };
const AUTH = "Bearer eyJzZXNzaW9u";

const wireOp = (over: Partial<SyncWireOperation> = {}): SyncWireOperation => ({
  idempotencyKey: "11111111-1111-4111-8111-111111111111",
  tenantId: "t-1",
  entity: "customers",
  entityId: "c-1",
  operation: "INSERT",
  payload: { full_name: "Awa" },
  createdAt: "2026-06-01T08:00:00.000Z",
  ...over,
});

describe("validateSyncPushBody", () => {
  it("accepte un lot d'opérations plausibles", () => {
    const body = validateSyncPushBody({ batch: [wireOp()] });
    expect(body.batch).toHaveLength(1);
    expect(body.batch[0].operation).toBe("INSERT");
  });

  it("refuse un corps qui n'est pas un objet", () => {
    expect(() => validateSyncPushBody("nope")).toThrow(SyncRelayError);
    expect(() => validateSyncPushBody(null)).toThrow(SyncRelayError);
  });

  it("refuse un lot vide ou trop grand", () => {
    expect(() => validateSyncPushBody({ batch: [] })).toThrow(/Aucune opération/);
    const lots = Array.from({ length: 201 }, () => wireOp());
    expect(() => validateSyncPushBody({ batch: lots })).toThrow(/trop grand/);
  });

  it("refuse une opération hors contrat", () => {
    expect(() =>
      validateSyncPushBody({
        batch: [wireOp({ operation: "DROP" as unknown as "INSERT" })],
      }),
    ).toThrow(/lot est invalide/);
    expect(() =>
      validateSyncPushBody({
        batch: [wireOp({ payload: null as unknown as Record<string, unknown> })],
      }),
    ).toThrow(/lot est invalide/);
    expect(() =>
      validateSyncPushBody({ batch: [wireOp({ idempotencyKey: "" })] }),
    ).toThrow(/lot est invalide/);
  });
});

describe("isPlausibleWireOp", () => {
  it("valide INSERT/UPDATE/DELETE et refuse le reste", () => {
    expect(isPlausibleWireOp(wireOp({ operation: "UPDATE" }))).toBe(true);
    expect(isPlausibleWireOp(wireOp({ operation: "DELETE" }))).toBe(true);
    expect(isPlausibleWireOp(wireOp({ operation: "UPSERT" as unknown as "INSERT" }))).toBe(false);
  });
});

describe("mapSyncPushRpc", () => {
  it("mappe SYNCED / CONFLICT / FAILED et ignore les clés absentes", () => {
    const request = {
      batch: [
        wireOp({ idempotencyKey: "k-synced" }),
        wireOp({ idempotencyKey: "k-conflict" }),
        wireOp({ idempotencyKey: "k-failed" }),
        wireOp({ idempotencyKey: "k-inconnu" }),
      ],
    };
    const mapped = mapSyncPushRpc(
      {
        data: {
          results: [
            { idempotencyKey: "k-synced", outcome: { kind: "SYNCED", record: { id: "c-1" } } },
            { idempotencyKey: "k-conflict", outcome: { kind: "CONFLICT", reason: "version" } },
            { idempotencyKey: "k-failed", outcome: { kind: "FAILED", error: "RLS" } },
          ],
        },
        error: null,
      },
      request,
    );
    expect(mapped.results).toHaveLength(3);
    expect(mapped.results[0].outcome.kind).toBe("SYNCED");
    expect(mapped.results[1].outcome.kind).toBe("CONFLICT");
    expect(mapped.results[2].outcome.kind).toBe("FAILED");
  });

  it("lève une erreur relay si le RPC renvoie une erreur", () => {
    expect(() =>
      mapSyncPushRpc(
        { data: null, error: { code: "PGRST301", message: "permission" } },
        { batch: [] },
      ),
    ).toThrow(SyncRelayError);
  });

  it("lève si la réponse serveur est incomplète (contrat cassé)", () => {
    expect(() =>
      mapSyncPushRpc(
        { data: { results: "pas-un-tableau" }, error: null },
        { batch: [] },
      ),
    ).toThrow(/Réponse du serveur/);
  });
});

describe("relaySyncPush", () => {
  it("POSTe sur le RPC avec la session et l'apikey, puis mappe la réponse", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init: init ?? {} });
      return new Response(
        JSON.stringify({
          results: [
            { idempotencyKey: "k-1", outcome: { kind: "SYNCED", record: { id: "c-1" } } },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;

    const response = await relaySyncPush(ENV, AUTH, { batch: [wireOp({ idempotencyKey: "k-1" })] }, fetchImpl);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://abc.supabase.co/rest/v1/rpc/sync_push");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["apikey"]).toBe("pk_anon");
    expect(headers["authorization"]).toBe(AUTH);
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({
      p_batch: [{ idempotencyKey: "k-1" }],
    });
    expect(response.results).toHaveLength(1);
    expect(response.results[0].outcome.kind).toBe("SYNCED");
  });

  it("traduit une erreur upstream en SyncRelayError avec code PostgREST", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ code: "PGRST301", message: "no" }), { status: 401 })) as typeof fetch;
    await expect(relaySyncPush(ENV, AUTH, { batch: [wireOp()] }, fetchImpl)).rejects.toMatchObject({
      status: 401,
      code: "PGRST301",
    });
  });

  it("capture une panne réseau en NETWORK_UNAVAILABLE", async () => {
    const fetchImpl = (async () => {
      throw new Error("ECONNRESET");
    }) as typeof fetch;
    await expect(relaySyncPush(ENV, AUTH, { batch: [wireOp()] }, fetchImpl)).rejects.toMatchObject({
      status: 0,
      code: "NETWORK_UNAVAILABLE",
    });
  });
});