import { describe, expect, it } from "vitest";
import { fcfaInWords, numberToFrenchWords } from "@/domain/moneyWords";

describe("numberToFrenchWords", () => {
  it.each([
    [0, "zéro"],
    [1, "un"],
    [17, "dix-sept"],
    [21, "vingt et un"],
    [71, "soixante et onze"],
    [77, "soixante-dix-sept"],
    [80, "quatre-vingts"],
    [81, "quatre-vingt-un"],
    [99, "quatre-vingt-dix-neuf"],
    [100, "cent"],
    [200, "deux cents"],
    [250, "deux cent cinquante"],
    [1000, "mille"],
    [1500, "mille cinq cents"],
    [80_000, "quatre-vingt mille"],
    [200_000, "deux cent mille"],
    [50_000, "cinquante mille"],
    [1_000_000, "un million"],
    [2_350_000, "deux millions trois cent cinquante mille"],
    [200_000_000, "deux cents millions"],
    [1_000_000_000, "un milliard"],
  ])("%i → %s", (value, words) => {
    expect(numberToFrenchWords(value)).toBe(words);
  });

  it("refuse les montants invalides", () => {
    expect(() => numberToFrenchWords(-1)).toThrow("AMOUNT_INVALID");
    expect(() => numberToFrenchWords(1.5)).toThrow("AMOUNT_INVALID");
  });

  it("accorde « franc »", () => {
    expect(fcfaInWords(1)).toBe("un franc CFA");
    expect(fcfaInWords(35_000)).toBe("trente-cinq mille francs CFA");
  });
});
