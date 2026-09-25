import { parseCentiUnits } from "@/domain/inventory/units";

export const STOCK_MOVEMENT_TYPES = ["IN", "OUT", "ADJUST"] as const;

export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

export interface StockMovementRecord {
  id: string;
  tenant_id: string;
  fabric_id: string;
  type: StockMovementType;
  /** Centi-unités ; signé uniquement pour ADJUST (delta), positif pour IN/OUT. */
  quantity: number;
  balance_after: number;
  reason: string | null;
  order_item_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface StockMovementDraftInput {
  fabricId: string;
  type: string;
  /** IN/OUT : quantité ; ADJUST : stock cible. */
  meters: string;
  reason?: string | null;
}

export interface StockMovementDraftClean {
  fabricId: string;
  type: StockMovementType;
  /** Valeur centi exacte, déjà validée. */
  quantityCenti: number;
  reason: string | null;
}

export type StockMovementDraftErrors = Partial<
  Record<"type" | "meters", string>
>;

export function validateStockMovementDraft(
  input: StockMovementDraftInput,
): { value: StockMovementDraftClean; errors: StockMovementDraftErrors } {
  const errors: StockMovementDraftErrors = {};
  if (!STOCK_MOVEMENT_TYPES.includes(input.type as StockMovementType)) {
    errors.type = "Type de mouvement invalide.";
  }
  const quantityCenti = parseCentiUnits(input.meters);
  if (quantityCenti === null) {
    errors.meters = "Longueur invalide (ex : 2,50).";
  } else if (input.type !== "ADJUST" && quantityCenti === 0) {
    errors.meters = "Doit être supérieure à 0.";
  }

  return {
    value: {
      fabricId: input.fabricId.trim(),
      type: input.type as StockMovementType,
      quantityCenti: quantityCenti ?? 0,
      reason:
        input.reason !== undefined && input.reason !== null && input.reason.trim() !== ""
          ? input.reason.trim()
          : null,
    },
    errors,
  };
}

/**
 * Applique un mouvement sur le stock courant (en centi-unités).
 * IN : ajoute la quantité ; OUT : soustrait sans jamais passer sous zéro ;
 * ADJUST : impose un stock cible non négatif (delta = cible - courant).
 */
export function applyStockDelta(
  current: number,
  type: StockMovementType,
  meters: number,
):
  | { ok: true; delta: number; balanceAfter: number }
  | { ok: false; reason: string } {
  if (!Number.isSafeInteger(current) || current < 0) {
    return { ok: false, reason: "Stock courant invalide." };
  }
  if (!Number.isSafeInteger(meters) || meters < 0) {
    return { ok: false, reason: "Longueur invalide." };
  }
  const delta =
    type === "OUT" ? -meters : type === "IN" ? meters : meters - current;
  const balanceAfter = current + delta;
  if (balanceAfter < 0) {
    return { ok: false, reason: "Stock insuffisant pour cette sortie." };
  }
  return { ok: true, delta, balanceAfter };
}