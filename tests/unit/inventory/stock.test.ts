import { describe, expect, it } from "vitest";
import {
  formatCentiUnits,
  formatMeters,
  parseCentiUnits,
} from "@/domain/inventory/units";
import { validateFabricDraft } from "@/domain/inventory/fabrics";
import {
  applyStockDelta,
  validateStockMovementDraft,
} from "@/domain/inventory/stock";

describe("unités centiécimales", () => {
  it("parse mètres exacts (virgule ou point, 2 décimales max)", () => {
    expect(parseCentiUnits("2,50")).toBe(250);
    expect(parseCentiUnits("2,5")).toBe(250);
    expect(parseCentiUnits("2.50")).toBe(250);
    expect(parseCentiUnits("12")).toBe(1200);
    expect(parseCentiUnits("0,05")).toBe(5);
    expect(parseCentiUnits(" 4,75 ")).toBe(475);
    expect(parseCentiUnits("2,505")).toBeNull();
    expect(parseCentiUnits("abc")).toBeNull();
    expect(parseCentiUnits("-1")).toBeNull();
  });

  it("formate mètres et centi", () => {
    expect(formatCentiUnits(1250)).toBe("12,50");
    expect(formatCentiUnits(5)).toBe("0,05");
    expect(formatMeters(2050)).toBe("20,50 m");
  });
});

describe("validateFabricDraft", () => {
  it("accepte une fiche tissue valide", () => {
    const draft = validateFabricDraft({
      name: "  Wax bleu  ",
      color: "  Bleu cobalt  ",
      supplier: "",
      unitPriceInput: "2 550",
      initialMeters: "10",
    });
    expect(draft.errors).toEqual({});
    expect(draft.value.name).toBe("Wax bleu");
    expect(draft.value.color).toBe("Bleu cobalt");
    expect(draft.value.supplier).toBeNull();
    expect(draft.value.unitPrice).toBe(2550);
    expect(draft.value.initialMeters).toBe(1000);
  });

  it("exige un nom et signale prix/longueur invalides", () => {
    const draft = validateFabricDraft({
      name: "x",
      unitPriceInput: "abc",
      initialMeters: "nimporte",
    });
    expect(draft.errors.name).toBeTruthy();
    expect(draft.errors.unitPrice).toBeTruthy();
    expect(draft.errors.initialMeters).toBeTruthy();
  });
});

describe("validateStockMovementDraft", () => {
  it("refuse un type inconnu, une longueur invalide ou une sortie nulle", () => {
    expect(
      validateStockMovementDraft({ fabricId: "f1", type: "RESET", meters: "1" }).errors.type,
    ).toBeTruthy();
    expect(
      validateStockMovementDraft({ fabricId: "f1", type: "IN", meters: "xx" }).errors.meters,
    ).toBeTruthy();
    expect(
      validateStockMovementDraft({ fabricId: "f1", type: "OUT", meters: "0" }).errors.meters,
    ).toContain("supérieure");
  });

  it("accepte un ajustement à zéro (mise à blanc)", () => {
    const draft = validateStockMovementDraft({
      fabricId: "f1",
      type: "ADJUST",
      meters: "0",
      reason: "  Perte constatée  ",
    });
    expect(draft.errors).toEqual({});
    expect(draft.value.quantityCenti).toBe(0);
    expect(draft.value.reason).toBe("Perte constatée");
  });
});

describe("applyStockDelta", () => {
  it("entrée et sortie", () => {
    expect(applyStockDelta(1000, "IN", 250)).toEqual({
      ok: true,
      delta: 250,
      balanceAfter: 1250,
    });
    expect(applyStockDelta(1250, "OUT", 300)).toEqual({
      ok: true,
      delta: -300,
      balanceAfter: 950,
    });
  });

  it("refuse une sortie qui dépasse le stock", () => {
    const result = applyStockDelta(500, "OUT", 501);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("insuffisant");
  });

  it("ajustement : impose la cible, delta = cible - courant", () => {
    expect(applyStockDelta(950, "ADJUST", 800)).toEqual({
      ok: true,
      delta: -150,
      balanceAfter: 800,
    });
    expect(applyStockDelta(950, "ADJUST", 1200)).toEqual({
      ok: true,
      delta: 250,
      balanceAfter: 1200,
    });
  });
});