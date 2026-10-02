import type { StockService } from "@/application/stock/stockService";
import { createStockService } from "@/application/stock/stockService";
import { getClientsFacade } from "@/features/clients/facade";
import { makeLocalInventoryStores } from "@/repository/local/inventory";
import { createIndexedDbCache } from "@/repository/local/indexeddb/cache";
import { scopedToSession } from "@/application/auth/session";

export interface StockFacade {
  stock: StockService;
}

export function createStockFacade(input: {
  tenantId: string;
  profileId: string | null;
}): StockFacade {
  const clientsFacade = getClientsFacade();
  const cache = createIndexedDbCache(input.tenantId);
  const stores = makeLocalInventoryStores(cache);

  const stock = createStockService({
    tenantId: input.tenantId,
    profileId: input.profileId,
    fabrics: stores.fabrics,
    movements: stores.movements,
    engine: clientsFacade.engine,
  });

  return { stock };
}

const scopedStockFacade = scopedToSession((session) =>
  createStockFacade({ tenantId: session.tenantId, profileId: session.profileId }),
);

export function getStockFacade(): StockFacade {
  if (typeof window === "undefined") {
    throw new Error("STOCK_FACADE_SERVER_SIDE");
  }
  return scopedStockFacade();
}
