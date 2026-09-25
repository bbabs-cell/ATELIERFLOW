import type { StockService } from "@/application/stock/stockService";
import { createStockService } from "@/application/stock/stockService";
import { getClientsFacade } from "@/features/clients/facade";
import { makeLocalInventoryStores } from "@/repository/local/inventory";
import { createIndexedDbCache } from "@/repository/local/indexeddb/cache";
import { STOCK_DEMO_PROFILE_ID, STOCK_DEMO_TENANT_ID } from "./constants";

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

let singleton: StockFacade | null = null;

export function getStockFacade(): StockFacade {
  if (typeof window === "undefined") {
    throw new Error("STOCK_FACADE_SERVER_SIDE");
  }
  if (singleton === null) {
    singleton = createStockFacade({
      tenantId: STOCK_DEMO_TENANT_ID,
      profileId: STOCK_DEMO_PROFILE_ID,
    });
  }
  return singleton;
}