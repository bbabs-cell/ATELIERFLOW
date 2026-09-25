import type { FabricRecord } from "@/domain/inventory/fabrics";
import type { StockMovementRecord } from "@/domain/inventory/stock";
import type { LocalCachePort } from "@/repository/ports/sync";
import type {
  FabricsRepository,
  StockMovementsRepository,
} from "@/repository/ports/inventory";

const FABRICS_ENTITY = "fabrics";
const MOVEMENTS_ENTITY = "stock_movements";

function asEntity<T>(records: unknown[]): T[] {
  return records as T[];
}

export function makeLocalFabricsRepository(
  cache: LocalCachePort,
): FabricsRepository {
  async function listAll(): Promise<FabricRecord[]> {
    const records = asEntity<FabricRecord>(await cache.list(FABRICS_ENTITY));
    return records.sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }

  async function getFabric(id: string): Promise<FabricRecord | null> {
    return (await cache.get(FABRICS_ENTITY, id)) as FabricRecord | null;
  }

  async function saveFabric(record: FabricRecord): Promise<void> {
    await cache.put(FABRICS_ENTITY, record.id, record);
  }

  return { listAll, getFabric, saveFabric };
}

export function makeLocalStockMovementsRepository(
  cache: LocalCachePort,
): StockMovementsRepository {
  async function listAll(): Promise<StockMovementRecord[]> {
    const records = asEntity<StockMovementRecord>(await cache.list(MOVEMENTS_ENTITY));
    return records.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  async function listByFabric(fabricId: string): Promise<StockMovementRecord[]> {
    const records = asEntity<StockMovementRecord>(await cache.list(MOVEMENTS_ENTITY));
    return records
      .filter((m) => m.fabric_id === fabricId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  async function saveMovement(record: StockMovementRecord): Promise<void> {
    await cache.put(MOVEMENTS_ENTITY, record.id, record);
  }

  return { listAll, listByFabric, saveMovement };
}

export function makeLocalInventoryStores(cache: LocalCachePort): {
  fabrics: FabricsRepository;
  movements: StockMovementsRepository;
} {
  return {
    fabrics: makeLocalFabricsRepository(cache),
    movements: makeLocalStockMovementsRepository(cache),
  };
}