import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { SyncEngine } from "@/application/sync/engine";
import { createIndexedDbCache } from "@/repository/local/indexeddb/cache";
import { createIndexedDbQueue } from "@/repository/local/indexeddb/queue";
import type { SyncPushRequest, SyncPushResponse } from "@/domain/sync/types";

/**
 * Refus de plan (0022) : une création au-delà des limites est FAILED
 * (PLAN_LIMIT:…) ; après un changement de plan, « Réessayer » la renvoie
 * avec une NOUVELLE clé d'idempotence (le serveur garde la réponse d'une
 * clé), dépendances comprises et dans l'ordre d'origine.
 */
function fakeServer() {
  let planFull = true;
  const seenKeys = new Map<string, SyncPushResponse["results"][number]["outcome"]>();
  const applied: string[] = [];
  return {
    applied,
    upgrade: () => {
      planFull = false;
    },
    async push(request: SyncPushRequest): Promise<SyncPushResponse> {
      return {
        results: request.batch.map((op) => {
          const previous = seenKeys.get(op.idempotencyKey);
          if (previous) return { idempotencyKey: op.idempotencyKey, outcome: previous };
          let outcome: SyncPushResponse["results"][number]["outcome"];
          if (op.entity === "customers" && planFull) outcome = { kind: "FAILED", error: "PLAN_LIMIT:customers" };
          else if (op.entity === "orders" && !applied.includes(`customers:${(op.payload as { customer_id: string }).customer_id}`))
            outcome = { kind: "FAILED", error: "NOT_FOUND:customers" };
          else {
            applied.push(`${op.entity}:${op.entityId}`);
            outcome = { kind: "SYNCED", record: null };
          }
          seenKeys.set(op.idempotencyKey, outcome);
          return { idempotencyKey: op.idempotencyKey, outcome };
        }),
      };
    },
  };
}

describe("refus de plan", () => {
  it("liste les refus puis les renvoie après changement de plan", async () => {
    const tenant = "bbbbbbbb-0000-4000-8000-000000000021";
    const queue = createIndexedDbQueue(tenant);
    const server = fakeServer();
    let clock = 1_790_000_000_000;
    const engine = new SyncEngine({
      queue,
      cache: createIndexedDbCache(tenant),
      remote: { push: (r) => server.push(r) },
      now: () => clock,
    });

    await engine.enqueue({ tenantId: tenant, profileId: "p", entity: "customers", entityId: "c-1", operation: "INSERT", payload: { full_name: "Awa" } });
    clock += 1_000;
    await engine.enqueue({ tenantId: tenant, profileId: "p", entity: "orders", entityId: "o-1", operation: "INSERT", payload: { customer_id: "c-1" } });

    const first = await engine.flush();
    expect(first.failed).toBe(2);
    const refusals = await engine.planRefusals();
    expect(refusals.map((op) => [op.entity, op.lastError])).toEqual([["customers", "PLAN_LIMIT:customers"]]);

    // Même clé = même réponse : un simple renvoi ne servirait à rien.
    server.upgrade();
    clock += 60_000;
    expect(await engine.retryRefused()).toBe(2);
    expect(await engine.planRefusals()).toEqual([]);

    const second = await engine.flush();
    expect(second.synced).toBe(2);
    expect(server.applied).toEqual(["customers:c-1", "orders:o-1"]);
    expect(await queue.listAll()).toEqual([]);
    expect(await queue.listFailed()).toEqual([]);
  });
});
