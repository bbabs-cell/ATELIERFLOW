import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { createClientsService } from "@/application/clients/clientService";
import { createMeasurementService } from "@/application/clients/measurementService";
import { SyncEngine } from "@/application/sync/engine";
import { makeLocalClientsStores } from "@/repository/local/clients";
import { createIndexedDbCache } from "@/repository/local/indexeddb/cache";
import { createIndexedDbQueue } from "@/repository/local/indexeddb/queue";
import { createFakeSyncServer } from "../../support/fakeSyncServer";

function makeHarness(tenantId = "aaa-111-plgq", profileId: string | null = "p-a") {
  const queue = createIndexedDbQueue(tenantId);
  const cache = createIndexedDbCache(tenantId);
  const server = createFakeSyncServer();
  const stores = makeLocalClientsStores(cache);
  let t = 1_700_000_000_000;
  const now = () => new Date((t += 1_000)).toISOString();
  let n = 0;
  const uuid = () => `00000000-0000-4000-8000-${(n += 1)
    .toString(16)
    .padStart(12, "0")}`;
  const engine = new SyncEngine({
    queue,
    cache,
    remote: server,
    now: () => t,
    uuid: () => `10000000-0000-4000-8000-${(n += 1).toString(16).padStart(12, "0")}`,
  });
  return {
    queue,
    cache,
    server,
    stores,
    engine,
    now,
    uuid,
    clients: createClientsService({
      tenantId,
      profileId,
      customers: stores.customers,
      profiles: stores.profiles,
      snapshots: stores.snapshots,
      engine,
      now,
      uuid,
    }),
    measures: createMeasurementService({
      tenantId,
      profileId,
      profiles: stores.profiles,
      snapshots: stores.snapshots,
      engine,
      now,
      uuid,
    }),
  };
}

const CONTACT = {
  full_name: "  Awa   Diop ",
  phone: "+221 77 123 45 67",
  email: " Awa@exemple.FR ",
};

describe("createClientsService (offline-first)", () => {
  it("crée un client en local et l'enfile pour synchronisation", async () => {
    const h = makeHarness();
    const res = await h.clients.createCustomer(CONTACT);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.customer.full_name).toBe("Awa Diop");
    expect(res.customer.email).toBe("awa@exemple.fr");
    expect(res.customer.tenant_id).toBe("aaa-111-plgq");

    const cached = await h.cache.get("customers", res.customer.id);
    expect((cached as { full_name: string }).full_name).toBe("Awa Diop");

    const list = await h.clients.listCustomers({});
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(res.customer.id);
  });

  it("rejette un numéro de téléphone doublon actif", async () => {
    const h = makeHarness();
    await h.clients.createCustomer(CONTACT);
    const res = await h.clients.createCustomer({ ...CONTACT, full_name: "Marie K" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.phone).toBeTruthy();
  });

  it("autorise le doublon sur un client archivé", async () => {
    const h = makeHarness();
    const first = await h.clients.createCustomer(CONTACT);
    if (!first.ok) return;
    await h.clients.archiveCustomer(first.customer.id);

    const res = await h.clients.createCustomer({ ...CONTACT, full_name: "Marie K" });
    expect(res.ok).toBe(true);

    const list = await h.clients.listCustomers({});
    expect(list).toHaveLength(1);
    expect(list[0].full_name).toBe("Marie K");
  });

  it("archive sans détruire et reste hors liste par défaut", async () => {
    const h = makeHarness();
    const created = await h.clients.createCustomer(CONTACT);
    if (!created.ok) return;
    const archived = await h.clients.archiveCustomer(created.customer.id);
    expect(archived?.status).toBe("ARCHIVED");

    expect(await h.clients.listCustomers({})).toHaveLength(0);
    expect(await h.clients.listCustomers({ includeArchive: true })).toHaveLength(1);
    expect(await h.clients.getCustomer(created.customer.id)).not.toBeNull();
  });

  it("journalise INSERT puis UPDATE et les pousse au serveur (idempotent)", async () => {
    const h = makeHarness();
    const created = await h.clients.createCustomer(CONTACT);
    if (!created.ok) return;
    const updated = await h.clients.updateCustomer(created.customer.id, {
      ...CONTACT,
      phone: "+221 77 987 65 43",
    });
    expect(updated.ok).toBe(true);

    const report = await h.engine.flush();
    expect(report.synced).toBe(2);
    const pushed = h.server.pushed();
    expect(pushed).toHaveLength(2);
    expect(pushed.map((o) => o.operation)).toEqual(["INSERT", "UPDATE"]);
    expect((pushed[1].payload as { phone: string }).phone).toBe("+221779876543");
  });
});

describe("createMeasurementService", () => {
  it("crée un profil, refuse le doublon de nom", async () => {
    const h = makeHarness();
    const created = await h.measures.createProfile({
      name: "Costume homme",
      fields: [
        { key: "shoulder", label: "Épaule" },
        { key: "chest", label: "Poitrine" },
      ],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const dup = await h.measures.createProfile({
      name: "  costume homme ",
      fields: [{ key: "hip", label: "Hanches" }],
    });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.errors.name).toBeTruthy();

    expect(await h.measures.listProfiles()).toHaveLength(1);
  });

  it("enregistre un snapshot normalisé et l'hydrate avec les libellés", async () => {
    const h = makeHarness();
    const profile = await h.measures.createProfile({
      name: "Robe",
      fields: [
        { key: "bust", label: "Poitrine" },
        { key: "waist", label: "Taille" },
      ],
    });
    if (!profile.ok) return;

    const customer = await h.clients.createCustomer(CONTACT);
    if (!customer.ok) return;

    const res = await h.measures.saveMeasurements({
      customerId: customer.customer.id,
      profileId: profile.profile.id,
      values: { bust: "90", inconnue: 12, waist: 4 },
      notes: "Prise en atelier",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.snapshot.values).toEqual({ bust: 90, waist: 4 });
    expect(res.ignored).toContain("inconnue");

    const hydrated = await h.measures.latestMeasurements(customer.customer.id);
    expect(hydrated.profile_name).toBe("Robe");
    expect(hydrated.entries).toHaveLength(2);
    const bust = hydrated.entries.find((e) => e.key === "bust");
    expect(bust?.label).toBe("Poitrine");
    expect(bust?.value).toBe(90);
    expect(hydrated.notes).toBe("Prise en atelier");
  });

  it("pousse le profil et le snapshot en file de synchronisation", async () => {
    const h = makeHarness();
    const profile = await h.measures.createProfile({
      name: "Chemise",
      fields: [{ key: "chest", label: "Poitrine" }],
    });
    if (!profile.ok) return;
    const customer = await h.clients.createCustomer(CONTACT);
    if (!customer.ok) return;
    await h.measures.saveMeasurements({
      customerId: customer.customer.id,
      profileId: profile.profile.id,
      values: { chest: 96 },
    });

    const report = await h.engine.flush();
    expect(report.synced).toBe(3);
    const entities = h.server.pushed().map((o) => o.entity);
    expect(entities).toContain("measurement_profiles");
    expect(entities).toContain("measurement_snapshots");
    expect(entities).toContain("customers");
  });
});