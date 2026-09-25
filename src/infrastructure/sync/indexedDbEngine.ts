import { SyncEngine, type SyncEngineHandlers } from "@/application/sync/engine";
import { createIndexedDbCache } from "@/repository/local/indexeddb/cache";
import { createIndexedDbQueue } from "@/repository/local/indexeddb/queue";
import { purgeTenantDatabase } from "@/repository/local/indexeddb/db";
import { createHttpRemoteSync, type HttpRemoteSyncOptions } from "./remoteHttp";

export interface IndexedDbSyncOptions {
  remote?: HttpRemoteSyncOptions;
  handlers?: SyncEngineHandlers;
  batchSize?: number;
  stuckSyncingMs?: number;
}

export function createTenantSyncEngine(
  tenantId: string,
  options: IndexedDbSyncOptions = {},
): SyncEngine {
  return new SyncEngine({
    queue: createIndexedDbQueue(tenantId),
    cache: createIndexedDbCache(tenantId),
    remote: createHttpRemoteSync(options.remote ?? {}),
    handlers: options.handlers,
    batchSize: options.batchSize,
    stuckSyncingMs: options.stuckSyncingMs,
  });
}

export async function purgeTenantLocalData(tenantId: string): Promise<void> {
  await purgeTenantDatabase(tenantId);
}