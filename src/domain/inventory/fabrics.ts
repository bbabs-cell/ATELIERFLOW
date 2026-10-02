import { parseFcfa } from "@/domain/money";
import { parseCentiUnits } from "@/domain/inventory/units";

export const FABRIC_STATUSES = ["ACTIVE", "ARCHIVED"] as const;

export type FabricStatus = (typeof FABRIC_STATUSES)[number];

export const FABRIC_UNIT = "m";

export interface FabricRecord {
  id: string;
  tenant_id: string;
  name: string;
  color: string | null;
  supplier: string | null;
  /** Quantité en centi-unités (ex : 1250 = 12,50 m) — arithmétique exacte. */
  quantity: number;
  unit: string;
  /** Prix au mètre en F CFA entiers (ex : 2500 = 2 500 F CFA/m). */
  unit_price: number;
  photo_key: string | null;
  status: FabricStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface FabricDraftInput {
  name: string;
  color?: string | null;
  supplier?: string | null;
  unitPriceInput?: string;
  initialMeters?: string;
}

export interface FabricDraftClean {
  name: string;
  color: string | null;
  supplier: string | null;
  /** 0 si non renseigné. */
  unitPrice: number;
  /** null si pas de stock initial. */
  initialMeters: number | null;
}

export type FabricDraftErrors = Partial<
  Record<"name" | "unitPrice" | "initialMeters", string>
>;

export function validateFabricDraft(
  input: FabricDraftInput,
): { value: FabricDraftClean; errors: FabricDraftErrors } {
  const errors: FabricDraftErrors = {};
  const name = input.name.trim();
  if (name.length < 2 || name.length > 120) {
    errors.name = "Le nom est requis (2 à 120 caractères).";
  }

  let unitPrice = 0;
  if (input.unitPriceInput !== undefined && input.unitPriceInput.trim() !== "") {
    const parsed = parseFcfa(input.unitPriceInput);
    if (parsed === null) {
      errors.unitPrice = "Prix invalide : nombre entier de F CFA (ex : 2 500).";
    } else {
      unitPrice = parsed;
    }
  }

  let initialMeters: number | null = null;
  if (input.initialMeters !== undefined && input.initialMeters.trim() !== "") {
    const parsed = parseCentiUnits(input.initialMeters);
    if (parsed === null) {
      errors.initialMeters = "Longueur invalide (ex : 2,50).";
    } else {
      initialMeters = parsed;
    }
  }

  return {
    value: {
      name,
      color:
        input.color !== undefined && input.color !== null && input.color.trim() !== ""
          ? input.color.trim()
          : null,
      supplier:
        input.supplier !== undefined &&
        input.supplier !== null &&
        input.supplier.trim() !== ""
          ? input.supplier.trim()
          : null,
      unitPrice,
      initialMeters,
    },
    errors,
  };
}