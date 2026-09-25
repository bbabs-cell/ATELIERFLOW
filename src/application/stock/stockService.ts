import { SyncEngine } from "@/application/sync/engine";
import { newIdempotencyKey } from "@/domain/ids/idempotency";
import { validateFabricDraft } from "@/domain/inventory/fabrics";
import type {
  FabricDraftErrors,
  FabricDraftInput,
  FabricRecord,
} from "@/domain/inventory/fabrics";
import {
  applyStockDelta,
  validateStockMovementDraft,
} from "@/domain/inventory/stock";
import type {
  StockMovementDraftErrors,
  StockMovementRecord,
  StockMovementType,
} from "@/domain/inventory/stock";
import type {
  FabricsRepository,
  StockMovementsRepository,
} from "@/repository/ports/inventory";

const FABRICS_ENTITY = "fabrics";
const MOVEMENTS_ENTITY = "stock_movements";

export type CreateFabricResult =
  | { ok: true; fabric: FabricRecord }
  | { ok: false; errors: FabricDraftErrors };

export type RecordMovementResult =
  | { ok: true; fabric: FabricRecord; movement: StockMovementRecord }
  | { ok: false; errors: StockMovementDraftErrors | null; reason: string | null };

export type ArchiveFabricResult =
  | { ok: true; fabric: FabricRecord }
  | { ok: false; reason: string };

export interface StockService {
  listFabrics(
    search?: string,
    includeArchive?: boolean,
  ): Promise<FabricRecord[]>;
  getFabric(id: string): Promise<FabricRecord | null>;
  createFabric(input: FabricDraftInput): Promise<CreateFabricResult>;
  archiveFabric(id: string): Promise<ArchiveFabricResult>;
  recordMovement(input: {
    fabricId: string;
    type: StockMovementType;
    meters: string;
    reason?: string | null;
  }): Promise<RecordMovementResult>;
  fabricMovements(fabricId: string): Promise<StockMovementRecord[]>;
}

export interface StockServiceDeps {
  tenantId: string;
  profileId: string | null;
  fabrics: FabricsRepository;
  movements: StockMovementsRepository;
  engine: SyncEngine;
  now?: () => string;
  uuid?: () => string;
}

export function createStockService(deps: StockServiceDeps): StockService {
  const now = deps.now ?? (() => new Date().toISOString());
  const port =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto
      : undefined;
  const uuid = deps.uuid ?? (() => port?.randomUUID() ?? newIdempotencyKey());

  async function enqueue(
    operation: "INSERT" | "UPDATE",
    entity: string,
    entityId: string,
    payload: unknown,
  ) {
    await deps.engine.enqueue({
      tenantId: deps.tenantId,
      profileId: deps.profileId,
      entity,
      entityId,
      operation,
      payload,
    });
  }

  async function recordMovementImpl(
    input: { fabricId: string; type: string; meters: string; reason?: string | null },
  ): Promise<RecordMovementResult> {
    const draft = validateStockMovementDraft(input);
    if (Object.keys(draft.errors).length > 0) {
      return { ok: false, errors: draft.errors, reason: null };
    }

    const fabric = await deps.fabrics.getFabric(draft.value.fabricId);
    if (fabric === null) {
      return { ok: false, errors: null, reason: "Tissu introuvable." };
    }

    const meters = draft.value.quantityCenti;

    const applied = applyStockDelta(
      fabric.quantity,
      draft.value.type as StockMovementType,
      meters,
    );
    if (!applied.ok) {
      return { ok: false, errors: null, reason: applied.reason };
    }

    const movement: StockMovementRecord = {
      id: uuid(),
      tenant_id: deps.tenantId,
      fabric_id: fabric.id,
      type: draft.value.type as StockMovementType,
      quantity: applied.delta,
      balance_after: applied.balanceAfter,
      reason: draft.value.reason,
      order_item_id: null,
      created_by: deps.profileId,
      created_at: now(),
    };

    const updated: FabricRecord = {
      ...fabric,
      quantity: applied.balanceAfter,
      updated_at: movement.created_at,
    };

    await deps.movements.saveMovement(movement);
    await deps.fabrics.saveFabric(updated);
    await enqueue("INSERT", MOVEMENTS_ENTITY, movement.id, movement);
    await enqueue("UPDATE", FABRICS_ENTITY, updated.id, updated);

    return { ok: true, fabric: updated, movement };
  }

  return {
    async listFabrics(search = "", includeArchive = false) {
      const records = await deps.fabrics.listAll();
      const query = search.trim().toLowerCase();
      return records.filter((f) => {
        if (!includeArchive && f.status === "ARCHIVED") return false;
        if (query.length === 0) return true;
        return [f.name, f.color ?? "", f.supplier ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(query);
      });
    },
    async getFabric(id) {
      return deps.fabrics.getFabric(id);
    },
    async createFabric(input) {
      const draft = validateFabricDraft(input);
      if (Object.keys(draft.errors).length > 0) {
        return { ok: false, errors: draft.errors };
      }

      const fabric: FabricRecord = {
        id: uuid(),
        tenant_id: deps.tenantId,
        name: draft.value.name,
        color: draft.value.color,
        supplier: draft.value.supplier,
        quantity: draft.value.initialMeters ?? 0,
        unit: "m",
        unit_price: draft.value.unitPrice,
        photo_key: null,
        status: "ACTIVE",
        created_at: now(),
        updated_at: now(),
        deleted_at: null,
      };

      await deps.fabrics.saveFabric(fabric);
      await enqueue("INSERT", FABRICS_ENTITY, fabric.id, fabric);

      if (draft.value.initialMeters !== null) {
        const movement: StockMovementRecord = {
          id: uuid(),
          tenant_id: deps.tenantId,
          fabric_id: fabric.id,
          type: "ADJUST",
          quantity: draft.value.initialMeters,
          balance_after: draft.value.initialMeters,
          reason: "Stock initial",
          order_item_id: null,
          created_by: deps.profileId,
          created_at: now(),
        };
        await deps.movements.saveMovement(movement);
        await enqueue("INSERT", MOVEMENTS_ENTITY, movement.id, movement);
      }

      return { ok: true, fabric };
    },
    async archiveFabric(id) {
      const fabric = await deps.fabrics.getFabric(id);
      if (fabric === null) {
        return { ok: false, reason: "Tissu introuvable." };
      }
      if (fabric.status === "ARCHIVED") {
        return { ok: false, reason: "Tissu déjà archivé." };
      }
      const updated: FabricRecord = {
        ...fabric,
        status: "ARCHIVED",
        updated_at: now(),
      };
      await deps.fabrics.saveFabric(updated);
      await enqueue("UPDATE", FABRICS_ENTITY, updated.id, updated);
      return { ok: true, fabric: updated };
    },
    recordMovement: recordMovementImpl,
    async fabricMovements(fabricId) {
      return deps.movements.listByFabric(fabricId);
    },
  };
}