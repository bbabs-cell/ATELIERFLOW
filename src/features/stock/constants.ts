import type { BadgeTone } from "@/ui";
import { FABRIC_STATUSES } from "@/domain/inventory/fabrics";
import type { FabricStatus } from "@/domain/inventory/fabrics";
import {
  STOCK_MOVEMENT_TYPES,
  type StockMovementType,
} from "@/domain/inventory/stock";
import {
  ORDERS_DEMO_PROFILE_ID,
  ORDERS_DEMO_TENANT_ID,
} from "@/features/orders/constants";

export const STOCK_DEMO_TENANT_ID = ORDERS_DEMO_TENANT_ID;
export const STOCK_DEMO_PROFILE_ID = ORDERS_DEMO_PROFILE_ID;

export const FABRIC_STATUS_META: Record<
  FabricStatus,
  { label: string; tone: BadgeTone }
> = {
  ACTIVE: { label: "Actif", tone: "success" },
  ARCHIVED: { label: "Archivé", tone: "neutral" },
};

export const STOCK_MOVEMENT_TYPE_META: Record<
  StockMovementType,
  { label: string; tone: BadgeTone }
> = {
  IN: { label: "Entrée", tone: "success" },
  OUT: { label: "Sortie", tone: "warning" },
  ADJUST: { label: "Ajustement", tone: "info" },
};

export const STOCK_MOVEMENT_TYPES_LIST: StockMovementType[] = [
  ...STOCK_MOVEMENT_TYPES,
];

export const FABRIC_STATUSES_LIST: FabricStatus[] = [...FABRIC_STATUSES];