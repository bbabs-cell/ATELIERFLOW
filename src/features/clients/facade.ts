import type { ClientsService } from "@/application/clients/clientService";
import type { MeasurementService } from "@/application/clients/measurementService";
import { createClientsService } from "@/application/clients/clientService";
import { createMeasurementService } from "@/application/clients/measurementService";
import { SyncEngine } from "@/application/sync/engine";
import { makeLocalClientsStores } from "@/repository/local/clients";
import { createIndexedDbCache } from "@/repository/local/indexeddb/cache";
import { createIndexedDbQueue } from "@/repository/local/indexeddb/queue";
import { createRemoteSync } from "@/infrastructure/sync/chooseRemote";
import {
  CLIENTS_DEMO_PROFILE_ID,
  CLIENTS_DEMO_TENANT_ID,
} from "./constants";

export interface ClientsFacade {
  clients: ClientsService;
  measures: MeasurementService;
  engine: SyncEngine;
}

export function createClientsFacade(input: {
  tenantId: string;
  profileId: string | null;
}): ClientsFacade {
  const cache = createIndexedDbCache(input.tenantId);
  const queue = createIndexedDbQueue(input.tenantId);
  const stores = makeLocalClientsStores(cache);

  const engine = new SyncEngine({
    queue,
    cache,
    remote: createRemoteSync(),
  });

  const clients = createClientsService({
    tenantId: input.tenantId,
    profileId: input.profileId,
    customers: stores.customers,
    profiles: stores.profiles,
    snapshots: stores.snapshots,
    engine,
  });

  const measures = createMeasurementService({
    tenantId: input.tenantId,
    profileId: input.profileId,
    profiles: stores.profiles,
    snapshots: stores.snapshots,
    engine,
  });

  return { clients, measures, engine };
}

let singleton: ClientsFacade | null = null;

export function getClientsFacade(): ClientsFacade {
  if (typeof window === "undefined") {
    throw new Error("CLIENTS_FACADE_SERVER_SIDE");
  }
  if (singleton === null) {
    singleton = createClientsFacade({
      tenantId: CLIENTS_DEMO_TENANT_ID,
      profileId: CLIENTS_DEMO_PROFILE_ID,
    });
  }
  return singleton;
}