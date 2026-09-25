import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { SyncEngine } from "@/application/sync/engine";
import { createFakeSyncServer, type FakeSyncServer } from "../../support/fakeSyncServer";
import { createIndexedDbCache } from "@/repository/local/indexeddb/cache";
import { createIndexedDbQueue } from "@/repository/local/indexeddb/queue";
import { idbGet, openTenantDb } from "@/repository/local/indexeddb/db";
import type { LocalCachePort, SyncQueuePort } from "@/repository/ports/sync";
import type { SyncEngineHandlers, SyncEngineStatus } from "@/application/sync/engine";
import type { SyncOperation } from "@/domain/sync/types";

let clock = 0;

function advanceClock(ms: number): void {
  clock += ms;
}

function makeEngine(
  tenantId: string,
  server: FakeSyncServer,
  cache: LocalCachePort,
  queue: SyncQueuePort,
  handlers: SyncEngineHandlers = {},
): SyncEngine {
  return new SyncEngine({
    queue,
    cache,
    remote: { push: (r) => server.push(r) },
    handlers,
    now: () => clock,
  });
}

async function readOp(tenantId: string, key: string): Promise<SyncOperation | null> {
  const db = await openTenantDb(tenantId);
  return idbGet<SyncOperation>(db, "operations", key);
}

describe("offline sync engine (IndexedDB)", () => {
  it("reprend après une coupure pendant le push sans doublon", async () => {
    clock = 1_750_000_000_000;
    const tenant = "aaaaaaaa-0000-0000-0000-000000000001";
    const queue = createIndexedDbQueue(tenant);
    const cache = createIndexedDbCache(tenant);
    const server = createFakeSyncServer();
    const engine = makeEngine(tenant, server, cache, queue);

    const op = await engine.enqueue({
      tenantId: tenant,
      profileId: "p-a",
      entity: "payments",
      entityId: "pay-1",
      operation: "INSERT",
      payload: { orderId: "ord-1", amount: 1000 },
    });

    server.loseResponseNext();
    const first = await engine.flush();
    expect(first.synced).toBe(0);
    expect(first.networkError).toMatch(/response lost/i);

    const pendingAfterCrash = await queue.listAll();
    expect(pendingAfterCrash).toHaveLength(1);
    expect(pendingAfterCrash[0].idempotencyKey).toBe(op.idempotencyKey);

    advanceClock(3_600_000);
    const second = await engine.flush();
    expect(second.synced).toBe(1);

    const stored = await readOp(tenant, op.idempotencyKey);
    expect(stored?.status).toBe("SYNCED");

    expect(server.pushedCount(op.idempotencyKey)).toBe(2);
    expect(server.appliedCount(op.idempotencyKey)).toBe(1);
  });

  it("ne transmet jamais deux fois une opération in-flight", async () => {
    clock = 1_750_100_000_000;
    const tenant = "aaaaaaaa-0000-0000-0000-000000000002";
    const queue = createIndexedDbQueue(tenant);
    const cache = createIndexedDbCache(tenant);
    const server = createFakeSyncServer();
    const engine = makeEngine(tenant, server, cache, queue);

    const op = await engine.enqueue({
      tenantId: tenant,
      profileId: "p-a",
      entity: "orders",
      entityId: "ord-9",
      operation: "INSERT",
      payload: { reference: "ORD-2026-000001" },
    });

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let serverCalls = 0;
    const remote = {
      push: async (request: Parameters<FakeSyncServer["push"]>[0]) => {
        serverCalls += 1;
        await gate;
        return server.push(request);
      },
    };
    const gatedEngine = new SyncEngine({
      queue,
      cache,
      remote,
      now: () => clock,
    });

    const first = gatedEngine.flush();
    const second = gatedEngine.flush();
    release();
    const [r1, r2] = await Promise.all([first, second]);

    expect(serverCalls).toBe(1);
    expect(r1.synced).toBe(1);
    expect(r2.attempted).toBe(0);
    expect(op.idempotencyKey).toBeTruthy();
  });

  it("applique une seule fois une même opération poussée deux fois", async () => {
    const tenant = "aaaaaaaa-0000-0000-0000-000000000003";
    const server = createFakeSyncServer();
    const wireOp = {
      idempotencyKey: "bbbbbbbb-0000-0000-0000-000000000000",
      tenantId: tenant,
      entity: "receipts",
      entityId: "rec-1",
      operation: "INSERT" as const,
      payload: { reference: "REC-2026-000001" },
      createdAt: new Date().toISOString(),
    };

    const response = await server.push({ batch: [wireOp, wireOp] });
    expect(response.results).toHaveLength(2);
    expect(server.appliedCount(wireOp.idempotencyKey)).toBe(1);
    expect(server.pushedCount(wireOp.idempotencyKey)).toBe(2);
    expect(
      response.results.every((r) => r.outcome.kind === "SYNCED"),
    ).toBe(true);
  });

  it("passe offline → online sans perte ni doublement", async () => {
    clock = 1_750_200_000_000;
    const tenant = "aaaaaaaa-0000-0000-0000-000000000004";
    const queue = createIndexedDbQueue(tenant);
    const cache = createIndexedDbCache(tenant);
    const server = createFakeSyncServer();
    let online = false;

    const engine = new SyncEngine({
      queue,
      cache,
      remote: {
        push: async (request) => {
          if (!online) throw new Error("offline");
          return server.push(request);
        },
      },
      now: () => clock,
    });

    const order = await engine.enqueue({
      tenantId: tenant,
      profileId: "p-a",
      entity: "orders",
      entityId: "ord-2",
      operation: "INSERT",
      payload: { totalPrice: 5000 },
    });
    const settings = await engine.enqueue({
      tenantId: tenant,
      profileId: "p-a",
      entity: "tenant_settings",
      entityId: "settings-1",
      operation: "UPDATE",
      payload: { brandName: "Atelier A" },
    });
    await cache.put("orders", "ord-2", { draft: true });

    const offlineReport = await engine.flush();
    expect(offlineReport.networkError).toBe("offline");
    expect((await queue.listAll()).length).toBe(2);

    online = true;
    advanceClock(3_600_000);
    const onlineReport = await engine.flush();
    expect(onlineReport.synced).toBe(2);
    expect(server.appliedCount(order.idempotencyKey)).toBe(1);
    expect(server.appliedCount(settings.idempotencyKey)).toBe(1);

    const settingsRecord = await cache.get("tenant_settings", "settings-1");
    expect(settingsRecord).toMatchObject({ brandName: "Atelier A", serverRef: true });
    expect(await cache.get("orders", "ord-2")).toMatchObject({ draft: true });
  });

  it("passe un conflit financier en CONFLICT sans écraser le local", async () => {
    clock = 1_750_300_000_000;
    const tenant = "aaaaaaaa-0000-0000-0000-000000000005";
    const queue = createIndexedDbQueue(tenant);
    const cache = createIndexedDbCache(tenant);
    const server = createFakeSyncServer();
    const conflicts: string[] = [];
    const engine = makeEngine(tenant, server, cache, queue, {
      onConflict: (op, reason) => conflicts.push(`${op.entity}:${reason}`),
    });

    await cache.put("payments", "pay-9", { amount: 1000, local: true });
    const op = await engine.enqueue({
      tenantId: tenant,
      profileId: "p-a",
      entity: "payments",
      entityId: "pay-9",
      operation: "UPDATE",
      payload: { status: "CANCELLED" },
    });
    server.conflictKey(op.idempotencyKey, "solde divergent constaté");

    const report = await engine.flush();
    expect(report.conflicted).toBe(1);
    expect(conflicts).toEqual(["payments:solde divergent constaté"]);

    const stored = await readOp(tenant, op.idempotencyKey);
    expect(stored?.status).toBe("CONFLICT");
    expect(stored?.lastError).toBe("solde divergent constaté");

    expect(await cache.get("payments", "pay-9")).toEqual({
      amount: 1000,
      local: true,
    });
  });

  it("n'applique jamais le record serveur sur une entité financière même en SYNCED", async () => {
    clock = 1_750_400_000_000;
    const tenant = "aaaaaaaa-0000-0000-0000-000000000006";
    const queue = createIndexedDbQueue(tenant);
    const cache = createIndexedDbCache(tenant);
    const server = createFakeSyncServer();
    const engine = makeEngine(tenant, server, cache, queue);

    await cache.put("payments", "pay-10", { amount: 2500 });
    const op = await engine.enqueue({
      tenantId: tenant,
      profileId: "p-a",
      entity: "payments",
      entityId: "pay-10",
      operation: "INSERT",
      payload: { amount: 2500, method: "CASH" },
    });

    const report = await engine.flush();
    expect(report.synced).toBe(1);
    expect(server.appliedRecord(op.idempotencyKey)).toMatchObject({
      method: "CASH",
      serverRef: true,
    });
    expect(await cache.get("payments", "pay-10")).toEqual({ amount: 2500 });
  });

  it("expose un statut abonnable (pending/busy) pour les indicateurs UI", async () => {
    clock = 1_750_600_000_000;
    const tenant = "aaaaaaaa-0000-0000-0000-000000000008";
    const queue = createIndexedDbQueue(tenant);
    const cache = createIndexedDbCache(tenant);
    const server = createFakeSyncServer();
    const engine = makeEngine(tenant, server, cache, queue);

    const seen: SyncEngineStatus[] = [];
    const unsubscribe = engine.subscribe((status) => seen.push(status));
    expect(seen.at(-1)).toEqual({ busy: false, pending: 0 });

    await engine.enqueue({
      tenantId: tenant,
      profileId: "p-a",
      entity: "customers",
      entityId: "cus-1",
      operation: "INSERT",
      payload: { fullName: "Awa" },
    });
    expect(seen.at(-1)).toEqual({ busy: false, pending: 1 });

    await engine.flush();
    expect(seen.at(-1)).toEqual({ busy: false, pending: 0 });

    unsubscribe();
  });

  it("ré-essaie jusqu'à la limite puis passe FAILED sans le masquer", async () => {
    clock = 1_750_500_000_000;
    const tenant = "aaaaaaaa-0000-0000-0000-000000000007";
    const queue = createIndexedDbQueue(tenant);
    const cache = createIndexedDbCache(tenant);
    const server = createFakeSyncServer();
    const failed: string[] = [];
    const engine = makeEngine(tenant, server, cache, queue, {
      onFailed: (op, error) => failed.push(`${op.entity}:${error}`),
    });

    const op = await engine.enqueue({
      tenantId: tenant,
      profileId: "p-a",
      entity: "customers",
      entityId: "cus-x",
      operation: "INSERT",
      payload: { fullName: "Test" },
    });
    server.failKey(op.idempotencyKey, "phone déjà utilisé");

    const report = await engine.flush();
    expect(report.failed).toBe(1);
    expect(failed).toEqual(["customers:phone déjà utilisé"]);

    const stored = await readOp(tenant, op.idempotencyKey);
    expect(stored?.status).toBe("FAILED");
    expect(stored?.lastError).toBe("phone déjà utilisé");
  });
});
