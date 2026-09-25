import type { FabricRecord } from "@/domain/inventory/fabrics";
import type { StockMovementRecord } from "@/domain/inventory/stock";

export interface FabricsRepository {
  listAll(): Promise<FabricRecord[]>;
  getFabric(id: string): Promise<FabricRecord | null>;
  saveFabric(record: FabricRecord): Promise<void>;
}

export interface StockMovementsRepository {
  listAll(): Promise<StockMovementRecord[]>;
  listByFabric(fabricId: string): Promise<StockMovementRecord[]>;
  saveMovement(record: StockMovementRecord): Promise<void>;
}