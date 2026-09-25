import { describe, expect, it } from "vitest";
import {
  formatEuros,
  lineTotal,
  parseEurosToCentimes,
  sumCentimes,
} from "@/domain/money";

describe("parseEurosToCentimes", () => {
  it("parse les formats virgule et point, sans espaces", () => {
    expect(parseEurosToCentimes("12,50")).toBe(1250);
    expect(parseEurosToCentimes("12.50")).toBe(1250);
    expect(parseEurosToCentimes("12,5")).toBe(1250);
    expect(parseEurosToCentimes("12")).toBe(1200);
    expect(parseEurosToCentimes("0,99")).toBe(99);
    expect(parseEurosToCentimes("1 200,00")).toBe(120000);
  });

  it("refuse les valeurs non monétaires", () => {
    expect(parseEurosToCentimes("abc")).toBeNull();
    expect(parseEurosToCentimes("12,555")).toBeNull();
    expect(parseEurosToCentimes("")).toBeNull();
    expect(parseEurosToCentimes("-5")).toBeNull();
    expect(parseEurosToCentimes("1e3")).toBeNull();
  });
});

describe("formatEuros", () => {
  it("formate en euros avec groupage français", () => {
    expect(formatEuros(1250)).toBe("12,50 €");
    expect(formatEuros(99)).toBe("0,99 €");
    expect(formatEuros(120000)).toBe("1\u00A0200,00 €");
    expect(formatEuros(0)).toBe("0,00 €");
  });

  it("gère les surplus négatifs (crédits)", () => {
    expect(formatEuros(-5000)).toBe("-50,00 €");
  });
});

describe("lineTotal / sumCentimes", () => {
  it("calcule quantité × prix unitaire en entiers", () => {
    expect(lineTotal({ quantity: 3, unitPrice: 5000 })).toBe(15000);
  });

  it("refuse les entrées invalides", () => {
    expect(lineTotal({ quantity: 0, unitPrice: 5000 })).toBeNull();
    expect(lineTotal({ quantity: 3, unitPrice: -1 })).toBeNull();
  });

  it("somme sans flottants", () => {
    expect(sumCentimes([100, 250, 49])).toBe(399);
    expect(sumCentimes([100, -1])).toBeNull();
  });
});