import type { LocalCachePort } from "@/repository/ports/sync";
import {
  idbDelete,
  idbGet,
  idbGetAll,
  idbPut,
  openTenantDb,
  RECORDS_STORE,
} from "./db";

function entityKey(entity: string, id: string): string {
  return `${entity}::${id}`;
}

function isEntityRecord(
  record: unknown,
  entity: string,
): record is Record<string, unknown> {
  return (
    typeof record === "object" &&
    record !== null &&
    "entity_id" in record &&
    String((record as Record<string, unknown>).entity_id).startsWith(
      `${entity}::`,
    )
  );
}

function stripKey(record: Record<string, unknown>): unknown {
  const { entity_id, ...rest } = record;
  void entity_id;
  return rest;
}

export class IndexedDbLocalCache implements LocalCachePort {
  private readonly dbPromise: Promise<IDBDatabase>;

  constructor(tenantId: string) {
    this.dbPromise = openTenantDb(tenantId);
  }

  async get(entity: string, id: string): Promise<unknown | null> {
    const db = await this.dbPromise;
    const record = await idbGet<Record<string, unknown>>(
      db,
      RECORDS_STORE,
      entityKey(entity, id),
    );
    if (record === null) return null;
    const { entity_id: _entityId, ...rest } = record;
    void _entityId;
    return rest;
  }

  async put(entity: string, id: string, record: unknown): Promise<void> {
    const db = await this.dbPromise;
    await idbPut(db, RECORDS_STORE, {
      entity_id: entityKey(entity, id),
      ...(record as object),
    });
  }

  async remove(entity: string, id: string): Promise<void> {
    const db = await this.dbPromise;
    await idbDelete(db, RECORDS_STORE, entityKey(entity, id));
  }

  async purgeAll(): Promise<void> {
    const db = await this.dbPromise;
    const transaction = db.transaction(RECORDS_STORE, "readwrite");
    transaction.objectStore(RECORDS_STORE).clear();
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(new Error("IDB_CLEAR_ABORTED"));
    });
  }

  async list(entity: string): Promise<unknown[]> {
    const db = await this.dbPromise;
    const all = await idbGetAll<unknown>(db, RECORDS_STORE);
    return all
      .filter((record) => isEntityRecord(record, entity))
      .map((record) => stripKey(record as Record<string, unknown>));
  }
}

export function createIndexedDbCache(tenantId: string): LocalCachePort {
  return new IndexedDbLocalCache(tenantId);
}