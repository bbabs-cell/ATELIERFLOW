export const DB_PREFIX = "atelierflow";
export const DB_VERSION = 1;
export const OPERATIONS_STORE = "operations";
export const RECORDS_STORE = "records";
export const META_STORE = "meta";

export function dbNameFor(tenantId: string): string {
  return `${DB_PREFIX}:${tenantId}:${DB_VERSION}`;
}

export function getIndexedDb(): IDBFactory {
  if (typeof globalThis.indexedDB === "undefined") {
    throw new Error("INDEXEDDB_UNAVAILABLE");
  }
  return globalThis.indexedDB;
}

export function openTenantDb(tenantId: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = getIndexedDb().open(dbNameFor(tenantId), DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OPERATIONS_STORE)) {
        const ops = db.createObjectStore(OPERATIONS_STORE, {
          keyPath: "idempotencyKey",
        });
        ops.createIndex("status", "status", { unique: false });
        ops.createIndex("status_created", ["status", "createdAt"], {
          unique: false,
        });
      }
      if (!db.objectStoreNames.contains(RECORDS_STORE)) {
        db.createObjectStore(RECORDS_STORE, { keyPath: "entity_id" });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error(`IDB_OPEN_FAILED: ${request.error?.message ?? "unknown"}`));
  });
}

function withTransaction<T>(
  db: IDBDatabase,
  store: string,
  mode: IDBTransactionMode,
  collect: (tx: IDBTransaction, store: IDBObjectStore, setResult: (v: T) => void) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let result: T | undefined;
    const transaction = db.transaction(store, mode);
    collect(transaction, transaction.objectStore(store), (v) => {
      result = v;
    });
    transaction.oncomplete = () => resolve(result as T);
    transaction.onerror = () =>
      reject(new Error(`IDB_OP_FAILED: ${transaction.error?.message ?? "unknown"}`));
    transaction.onabort = () =>
      reject(new Error(`IDB_ABORTED: ${transaction.error?.message ?? "unknown"}`));
  });
}

export function idbPut(
  db: IDBDatabase,
  store: string,
  value: unknown,
): Promise<void> {
  return withTransaction<void>(db, store, "readwrite", (_tx, s) => {
    s.put(value);
  }).then(() => undefined);
}

export function idbPutMany(
  db: IDBDatabase,
  store: string,
  values: unknown[],
): Promise<void> {
  return withTransaction<void>(db, store, "readwrite", (_tx, s) => {
    for (const value of values) s.put(value);
  }).then(() => undefined);
}

export function idbGet<T>(
  db: IDBDatabase,
  store: string,
  key: IDBValidKey | IDBKeyRange,
): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, "readonly");
    const request = transaction.objectStore(store).get(key);
    request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
    request.onerror = () =>
      reject(new Error(`IDB_READ_FAILED: ${request.error?.message ?? "unknown"}`));
  });
}

export function idbGetAll<T>(
  db: IDBDatabase,
  store: string,
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, "readonly");
    const request = transaction.objectStore(store).getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () =>
      reject(new Error(`IDB_READ_FAILED: ${request.error?.message ?? "unknown"}`));
  });
}

export function idbGetAllByIndex<T>(
  db: IDBDatabase,
  store: string,
  indexName: string,
  key: IDBValidKey,
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, "readonly");
    const request = transaction.objectStore(store).index(indexName).getAll(key);
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () =>
      reject(new Error(`IDB_READ_FAILED: ${request.error?.message ?? "unknown"}`));
  });
}

export function idbDelete(
  db: IDBDatabase,
  store: string,
  key: IDBValidKey | IDBKeyRange,
): Promise<void> {
  return withTransaction<void>(db, store, "readwrite", (_tx, s) => {
    s.delete(key);
  }).then(() => undefined);
}

export function purgeTenantDatabase(tenantId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = getIndexedDb().deleteDatabase(dbNameFor(tenantId));
    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(new Error(`IDB_PURGE_FAILED: ${request.error?.message ?? "unknown"}`));
  });
}