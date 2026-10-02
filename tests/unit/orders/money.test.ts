import { describe, expect, it } from "vitest";
import { CURRENCY, formatFcfa, lineTotal, parseFcfa, sumAmounts } from "@/domain/money";

describe("parseFcfa", () => {
  it("lit des F CFA entiers, séparateurs de milliers tolérés", () => {
    expect(parseFcfa("50000")).toBe(50000);
    expect(parseFcfa("50 000")).toBe(50000);
    expect(parseFcfa("50 000")).toBe(50000);
    expect(parseFcfa("50.000")).toBe(50000);
    expect(parseFcfa("1.250.000")).toBe(1250000);
    expect(parseFcfa("15 000 F")).toBe(15000);
    expect(parseFcfa("15000 FCFA")).toBe(15000);
    expect(parseFcfa("15 000 F CFA")).toBe(15000);
    expect(parseFcfa("0")).toBe(0);
  });

  it("refuse décimales, signes et valeurs non monétaires", () => {
    expect(parseFcfa("12,50")).toBeNull();
    expect(parseFcfa("12.5")).toBeNull();
    expect(parseFcfa("50.00")).toBeNull();
    expect(parseFcfa("-5")).toBeNull();
    expect(parseFcfa("1e3")).toBeNull();
    expect(parseFcfa("abc")).toBeNull();
    expect(parseFcfa("")).toBeNull();
    expect(parseFcfa("99999999999999999999")).toBeNull();
  });
});

describe("formatFcfa", () => {
  it("formate en F CFA sans décimales, groupage français", () => {
    expect(formatFcfa(50000)).toBe("50 000 F CFA");
    expect(formatFcfa(1250000)).toBe("1 250 000 F CFA");
    expect(formatFcfa(0)).toBe("0 F CFA");
  });

  it("gère les surplus négatifs (crédits)", () => {
    expect(formatFcfa(-5000)).toBe("-5 000 F CFA");
  });

  it("aller-retour saisie → affichage sans changement d'unité", () => {
    expect(formatFcfa(parseFcfa("50 000") ?? -1)).toBe("50 000 F CFA");
  });
});

describe("lineTotal / sumAmounts", () => {
  it("devise XOF", () => {
    expect(CURRENCY).toBe("XOF");
  });

  it("calcule quantité × prix unitaire en entiers", () => {
    expect(lineTotal({ quantity: 3, unitPrice: 5000 })).toBe(15000);
  });

  it("refuse les entrées invalides", () => {
    expect(lineTotal({ quantity: 0, unitPrice: 5000 })).toBeNull();
    expect(lineTotal({ quantity: 3, unitPrice: -1 })).toBeNull();
  });

  it("somme sans flottants", () => {
    expect(sumAmounts([20000, 15000, 20000])).toBe(55000);
    expect(sumAmounts([100, -1])).toBeNull();
  });
});
