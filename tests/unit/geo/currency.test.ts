import { afterEach, describe, expect, it } from "vitest";
import { COUNTRIES, CURRENCIES, countryByCode, guessCountry } from "@/domain/geo/countries";
import { approxFromXof, convertFromXof, PEGGED_RATES, sanitizeRates } from "@/domain/geo/exchange";
import { formatFcfa, formatMoney, parseFcfa, setActiveCurrency } from "@/domain/money";
import { fcfaInWords } from "@/domain/moneyWords";
import { formatPrice } from "@/domain/subscriptions/entitlements";

const NB = " ";

afterEach(() => setActiveCurrency("XOF"));

describe("monnaie de l'atelier", () => {
  it("chaque pays a une monnaie connue", () => {
    for (const c of COUNTRIES) expect(CURRENCIES[c.currency], c.code).toBeDefined();
    expect(countryByCode("gn")?.currency).toBe("GNF");
    expect(guessCountry("fr-CI")).toBe("CI");
    expect(guessCountry("en")).toBe("SN");
  });

  it("F CFA par défaut, puis la monnaie de l'atelier active", () => {
    expect(formatFcfa(50000)).toBe(`50${NB}000${NB}F${NB}CFA`);
    setActiveCurrency("GNF");
    expect(formatFcfa(150000)).toBe(`150${NB}000${NB}GNF`);
    expect(formatMoney(85, "EUR")).toBe(`85${NB}€`);
    expect(fcfaInWords(2)).toBe("deux francs guinéens");
    setActiveCurrency("EUR");
    expect(fcfaInWords(1)).toBe("un euro");
  });

  it("les prix des plans restent en F CFA, quelle que soit la monnaie de l'atelier", () => {
    setActiveCurrency("GNF");
    expect(formatPrice(10000, "XOF")).toBe(`10${NB}000${NB}F${NB}CFA`);
    expect(formatPrice(0, "XOF")).toBe("Gratuit");
  });

  it("monnaie inconnue ou invalide : retour au F CFA", () => {
    setActiveCurrency("xx");
    expect(formatFcfa(1000)).toBe(`1${NB}000${NB}F${NB}CFA`);
  });

  it("saisie : suffixes de monnaie tolérés, entiers seulement", () => {
    expect(parseFcfa("150 000 GNF")).toBe(150000);
    expect(parseFcfa("85 €")).toBe(85);
    expect(parseFcfa("12,50 €")).toBeNull();
  });
});

describe("convertisseur des prix des plans", () => {
  it("parités fixes exactes", () => {
    expect(convertFromXof(655957, "EUR", PEGGED_RATES)).toBeCloseTo(1000, 6);
    expect(convertFromXof(10000, "XAF", PEGGED_RATES)).toBe(10000);
  });

  it("les parités fixes l'emportent sur le service, les taux invalides sont ignorés", () => {
    const rates = sanitizeRates({ EUR: 0.5, GNF: 15.1, MAD: -1, ZZZ: 3 });
    expect(rates.EUR).toBeCloseTo(1 / 655.957, 9);
    expect(rates.GNF).toBe(15.1);
    expect(rates.MAD).toBeUndefined();
    expect(rates.ZZZ).toBeUndefined();
  });

  it("affichage indicatif", () => {
    const rates = sanitizeRates({ GNF: 15.115244 });
    expect(approxFromXof(10000, "EUR", rates)).toBe(`≈${NB}15,24${NB}€`);
    expect(approxFromXof(10000, "GNF", rates)).toBe(`≈${NB}151${NB}152${NB}GNF`);
    expect(approxFromXof(10000, "XOF", rates)).toBeNull();
    expect(approxFromXof(10000, "MAD", rates)).toBeNull();
    expect(approxFromXof(0, "EUR", rates)).toBeNull();
  });
});
