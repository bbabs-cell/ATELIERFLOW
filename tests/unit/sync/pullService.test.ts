import { describe, expect, it } from "vitest";
import { createPullService, type PullRemote } from "@/application/sync/pullService";
import { maxCursor, PULL_ENTITIES, pullStart, type PullCursor } from "@/domain/sync/pull";
import type { LocalCachePort } from "@/repository/ports/sync";

function memoryCache(): LocalCachePort & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return {
    data,
    async get(entity, id) {
      return data.get(`${entity}:${id}`) ?? null;
    },
    async put(entity, id, record) {
      data.set(`${entity}:${id}`, record);
    },
    async remove(entity, id) {
      data.delete(`${entity}:${id}`);
    },
    async list(entity) {
      return [...data.entries()].filter(([k]) => k.startsWith(`${entity}:`)).map(([, v]) => v);
    },
  };
}

function memoryCursors() {
  const store = new Map<string, PullCursor>();
  return { store, get: (e: string) => store.get(e) ?? null, set: (e: string, c: PullCursor) => void store.set(e, c) };
}

/** Serveur simulé : lignes par table, pagination (curseur, id) comme PostgREST. */
function fakeRemote(tables: Record<string, Record<string, unknown>[]>, opts: { deny?: string[] } = {}) {
  const calls: { entity: string; from: string | null; after: PullCursor | null }[] = [];
  const remote: PullRemote = {
    async fetchPage({ entity, from, after, limit }) {
      calls.push({ entity: entity.entity, from, after });
      if (opts.deny?.includes(entity.entity)) throw new Error("permission denied");
      const col = entity.cursor;
      const rows = [...(tables[entity.entity] ?? [])].sort((a, b) =>
        String(a[col]) === String(b[col]) ? String(a.id).localeCompare(String(b.id)) : Date.parse(String(a[col])) - Date.parse(String(b[col])),
      );
      return rows
        .filter((r) => {
          const t = Date.parse(String(r[col]));
          if (after) {
            const ta = Date.parse(after.value);
            return t > ta || (t === ta && String(r.id) > after.id);
          }
          return from ? t >= Date.parse(from) : true;
        })
        .slice(0, limit);
    },
  };
  return { remote, calls };
}

const c = (id: string, at: string, extra: Record<string, unknown> = {}) => ({ id, full_name: id, updated_at: at, ...extra });

describe("curseurs", () => {
  it("recouvrement d'une minute et curseur le plus avancé", () => {
    expect(pullStart(null)).toBeNull();
    expect(pullStart({ value: "2026-10-02T10:01:00.000Z", id: "a" })).toBe("2026-10-02T10:00:00.000Z");
    expect(maxCursor({ value: "2026-10-02T10:00:00Z", id: "b" }, { value: "2026-10-02T10:00:00Z", id: "a" })?.id).toBe("b");
    expect(maxCursor(null, { value: "x", id: "a" })?.id).toBe("a");
    expect(PULL_ENTITIES.map((e) => e.entity).indexOf("customers")).toBeLessThan(PULL_ENTITIES.map((e) => e.entity).indexOf("orders"));
  });
});

describe("pullService", () => {
  it("premier passage : tout est lu et rangé dans le cache, curseur mémorisé", async () => {
    const cache = memoryCache();
    const cursors = memoryCursors();
    const { remote } = fakeRemote({ customers: [c("c1", "2026-10-02T10:00:00Z"), c("c2", "2026-10-02T11:00:00Z")] });
    const report = await createPullService({ remote, cache, cursors, unsettled: async () => new Set() }).pull();
    expect(report).toEqual({ changed: 2, skippedLocal: 0, failed: [] });
    expect(cache.data.get("customers:c2")).toMatchObject({ full_name: "c2" });
    expect(cursors.store.get("customers")).toEqual({ value: "2026-10-02T11:00:00Z", id: "c2" });
  });

  it("passage suivant : lecture depuis le curseur, rien à changer si identique", async () => {
    const cache = memoryCache();
    const cursors = memoryCursors();
    const tables = { customers: [c("c1", "2026-10-02T10:00:00Z")] };
    const { remote, calls } = fakeRemote(tables);
    const service = createPullService({ remote, cache, cursors, unsettled: async () => new Set() });
    await service.pull();
    calls.length = 0;
    expect((await service.pull()).changed).toBe(0);
    expect(calls.find((x) => x.entity === "customers")?.from).toBe("2026-10-02T09:59:00.000Z");
    tables.customers.push(c("c3", "2026-10-02T12:00:00Z", { phone: "77" }));
    tables.customers[0] = c("c1", "2026-10-02T12:30:00Z", { full_name: "Awa (modifié)" });
    expect((await service.pull()).changed).toBe(2);
    expect(cache.data.get("customers:c1")).toMatchObject({ full_name: "Awa (modifié)" });
  });

  it("ne remplace jamais une saisie locale encore en attente d'envoi", async () => {
    const cache = memoryCache();
    await cache.put("customers", "c1", c("c1", "2026-10-02T10:00:00Z", { full_name: "Saisie locale" }));
    const { remote } = fakeRemote({ customers: [c("c1", "2026-10-02T10:05:00Z", { full_name: "Version serveur" })] });
    const report = await createPullService({ remote, cache, cursors: memoryCursors(), unsettled: async () => new Set(["customers:c1"]) }).pull();
    expect(report.skippedLocal).toBe(1);
    expect(cache.data.get("customers:c1")).toMatchObject({ full_name: "Saisie locale" });
  });

  it("pagination complète sur plus d'une page, même horodatage compris", async () => {
    const cache = memoryCache();
    const rows = Array.from({ length: 1203 }, (_, i) => c(`c${String(i).padStart(5, "0")}`, "2026-10-02T10:00:00Z"));
    const { remote, calls } = fakeRemote({ customers: rows });
    const report = await createPullService({ remote, cache, cursors: memoryCursors(), unsettled: async () => new Set() }).pull();
    expect(report.changed).toBe(1203);
    expect(calls.filter((x) => x.entity === "customers")).toHaveLength(3);
  });

  it("table non lisible (droits du rôle) : signalée, les autres continuent", async () => {
    const cache = memoryCache();
    const cursors = memoryCursors();
    const { remote } = fakeRemote(
      { payments: [{ id: "p1", updated_at: "2026-10-02T10:00:00Z" }], appointments: [{ id: "a1", updated_at: "2026-10-02T10:00:00Z" }] },
      { deny: ["payments"] },
    );
    const report = await createPullService({ remote, cache, cursors, unsettled: async () => new Set() }).pull();
    expect(report.failed).toEqual(["payments"]);
    expect(cache.data.has("appointments:a1")).toBe(true);
    expect(cursors.store.has("payments")).toBe(false);
  });
});
