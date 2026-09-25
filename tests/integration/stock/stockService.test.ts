import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { createStockService } from "@/application/stock/stockService";
import { SyncEngine } from "@/application/sync/engine";
import { createIndexedDbCache } from "@/repository/local/indexeddb/cache";
import { createIndexedDbQueue } from "@/repository/local/indexeddb/queue";
import { makeLocalInventoryStores } from "@/repository/local/inventory";
import { createFakeSyncServer } from "../../support/fakeSyncServer";

let tenantSeq = 0;
const uniqueTenant = () =>
  `00000000-0000-4000-8000-00000000${(tenantSeq += 1).toString(16).padStart(8, "0")}`;

function makeHarness(tenantId: string = uniqueTenant()) {
  const queue = createIndexedDbQueue(tenantId);
  const cache = createIndexedDbCache(tenantId);
  const server = createFakeSyncServer();
  const stores = makeLocalInventoryStores(cache);
  let t = 1_767_225_599_000;
  const now = () => new Date((t += 1_000)).toISOString();
  let n = 0;
  const uuid = () => `20000000-0000-4000-8000-${(n += 1).toString(16).padStart(12, "0")}`;
  const engine = new SyncEngine({
    queue,
    cache,
    remote: server,
    now: () => t,
    uuid: () => `30000000-0000-4000-8000-${(n += 1).toString(16).padStart(12, "0")}`,
  });
  const stock = createStockService({
    tenantId,
    profileId: "p-owner",
    fabrics: stores.fabrics,
    movements: stores.movements,
    engine,
    now,
    uuid,
  });
  return { cache, server, engine, stock };
}

async function createWax(h: ReturnType<typeof makeHarness>) {
  const created = await h.stock.createFabric({
    name: "Wax bleu",
    color: "Bleu cobalt",
    supplier: "Maison du tissu",
    unitPriceEuros: "25,50",
    initialMeters: "10",
  });
  if (!created.ok) return null;
  return created.fabric;
}

describe("createStockService", () => {
  it("crée un tissu avec stock initial et son mouvement d'ouverture", async () => {
    const h = makeHarness();
    const fabric = await createWax(h);
    expect(fabric).not.toBeNull();
    if (!fabric) return;

    expect(fabric.quantity).toBe(1000);
    expect(fabric.unit_price).toBe(2550);
    expect(fabric.status).toBe("ACTIVE");

    const movements = await h.stock.fabricMovements(fabric.id);
    expect(movements).toHaveLength(1);
    expect(movements[0].type).toBe("ADJUST");
    expect(movements[0].quantity).toBe(1000);
    expect(movements[0].balance_after).toBe(1000);
    expect(movements[0].reason).toBe("Stock initial");
  });

  it("enchadîne entrées et sorties avec soldes exacts", async () => {
    const h = makeHarness();
    const fabric = await createWax(h);
    if (!fabric) return;

    const in1 = await h.stock.recordMovement({
      fabricId: fabric.id,
      type: "IN",
      meters: "2,5",
      reason: "Nouveau rouleau",
    });
    expect(in1.ok).toBe(true);
    if (in1.ok) {
      expect(in1.movement.quantity).toBe(250);
      expect(in1.movement.balance_after).toBe(1250);
      expect(in1.fabric.quantity).toBe(1250);
    }

    const out = await h.stock.recordMovement({
      fabricId: fabric.id,
      type: "OUT",
      meters: "3",
      reason: "Robe de cérémonie",
    });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.fabric.quantity).toBe(950);

    const tooMuch = await h.stock.recordMovement({
      fabricId: fabric.id,
      type: "OUT",
      meters: "100",
    });
    expect(tooMuch.ok).toBe(false);
    if (!tooMuch.ok) expect(tooMuch.reason).toContain("insuffisant");

    const current = await h.stock.getFabric(fabric.id);
    expect(current?.quantity).toBe(950);
  });

  it("ajuste à une cible (delta signé) et se met à blanc", async () => {
    const h = makeHarness();
    const fabric = await createWax(h);
    if (!fabric) return;

    const adjust = await h.stock.recordMovement({
      fabricId: fabric.id,
      type: "ADJUST",
      meters: "8,5",
      reason: "Inventaire",
    });
    expect(adjust.ok).toBe(true);
    if (adjust.ok) {
      expect(adjust.movement.quantity).toBe(-150);
      expect(adjust.movement.balance_after).toBe(850);
    }

    const clear = await h.stock.recordMovement({
      fabricId: fabric.id,
      type: "ADJUST",
      meters: "0",
      reason: "Perte constatée",
    });
    expect(clear.ok).toBe(true);
    if (clear.ok) expect(clear.fabric.quantity).toBe(0);
  });

  it("archive un tissu (pas de suppression) et l'exclut des listes par défaut", async () => {
    const h = makeHarness();
    const fabric = await createWax(h);
    if (!fabric) return;

    const archived = await h.stock.archiveFabric(fabric.id);
    expect(archived.ok).toBe(true);
    if (archived.ok) expect(archived.fabric.status).toBe("ARCHIVED");

    const again = await h.stock.archiveFabric(fabric.id);
    expect(again.ok).toBe(false);

    const visible = await h.stock.listFabrics();
    expect(visible).toHaveLength(0);
    const withArchive = await h.stock.listFabrics("", true);
    expect(withArchive).toHaveLength(1);
  });

  it("filtre par recherche (nom / couleur / fournisseur)", async () => {
    const h = makeHarness();
    await createWax(h);
    const byColor = await h.stock.listFabrics("cobalt");
    expect(byColor).toHaveLength(1);
    const bySupplier = await h.stock.listFabrics("Maison");
    expect(bySupplier).toHaveLength(1);
    const none = await h.stock.listFabrics("brodé");
    expect(none).toHaveLength(0);
  });

  it("refuse un mouvement sur un tissu inconnu ou un formulaire invalide", async () => {
    const h = makeHarness();
    const missing = await h.stock.recordMovement({
      fabricId: "absent",
      type: "IN",
      meters: "1",
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.reason).toBe("Tissu introuvable.");

    const invalid = await h.stock.recordMovement({
      fabricId: "absent",
      type: "IN",
      meters: "zz",
    });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.errors?.meters).toBeTruthy();
  });

  it("pousse le ledger et la fiche une seule fois (flush idempotent)", async () => {
    const h = makeHarness();
    const fabric = await createWax(h);
    if (!fabric) return;

    const report = await h.engine.flush();
    expect(report.networkError).toBeNull();

    const pushed = h.server.pushed();
    expect(pushed.filter((op) => op.entity === "fabrics")).toHaveLength(1);
    expect(pushed.filter((op) => op.entity === "stock_movements")).toHaveLength(1);
    expect(pushed.some((op) => op.operation === "INSERT")).toBe(true);

    await h.stock.recordMovement({ fabricId: fabric.id, type: "IN", meters: "1" });
    await h.engine.flush();
    const updated = h.server.pushed();
    expect(updated.filter((op) => op.entity === "stock_movements")).toHaveLength(2);
    expect(updated.filter((op) => op.entity === "fabrics")).toHaveLength(2);
    expect(updated.filter((op) => op.entity === "fabrics" && op.operation === "UPDATE")).toHaveLength(1);

    expect(await h.engine.flush()).toMatchObject({ synced: 0, attempted: 0 });
  });
});