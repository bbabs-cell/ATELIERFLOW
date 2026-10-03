import { groupThousands } from "@/domain/money";
import { CURRENCIES, currencyInfo } from "./countries";

/**
 * Conversion INDICATIVE des prix des plans (fixés en F CFA, XOF) vers la
 * monnaie d'un pays. Jamais utilisée pour un montant enregistré : le
 * montant dû reste celui calculé par le serveur en F CFA.
 *
 * Parités fixes (garanties, sans service externe) : 1 € = 655,957 F CFA ;
 * XAF = XOF ; 1 € = 491,96775 FC comoriens. Les autres monnaies suivent le
 * taux du jour.
 */
export type Rates = Record<string, number>;

const XOF_PER_EUR = 655.957;
export const PEGGED_RATES: Rates = {
  XOF: 1,
  XAF: 1,
  EUR: 1 / XOF_PER_EUR,
  KMF: 491.96775 / XOF_PER_EUR,
};

/** Garde uniquement les monnaies connues et des taux valides ; les parités fixes priment. */
export function sanitizeRates(raw: unknown): Rates {
  const out: Rates = {};
  if (raw && typeof raw === "object") {
    for (const code of Object.keys(CURRENCIES)) {
      const v = (raw as Record<string, unknown>)[code];
      if (typeof v === "number" && Number.isFinite(v) && v > 0) out[code] = v;
    }
  }
  return { ...out, ...PEGGED_RATES };
}

/** Montant XOF → monnaie cible ; null si le taux est inconnu. */
export function convertFromXof(amountXof: number, currency: string, rates: Rates): number | null {
  const rate = rates[currency];
  if (!rate) return null;
  return amountXof * rate;
}

/** « ≈ 15,24 € », « ≈ 151 150 GNF » : entier au-delà de 100, deux décimales en dessous. */
export function formatApprox(value: number, currency: string): string {
  const symbol = currencyInfo(currency).symbol.replace(/ /g, " ");
  if (value >= 100) return `≈ ${groupThousands(Math.round(value))} ${symbol}`;
  const [int, dec] = value.toFixed(2).split(".");
  return `≈ ${groupThousands(Number(int))},${dec} ${symbol}`;
}

/** Équivalent affichable d'un prix en F CFA, ou null (même monnaie / taux inconnu). */
export function approxFromXof(amountXof: number, currency: string | null | undefined, rates: Rates | null): string | null {
  if (!currency || currency === "XOF" || amountXof <= 0 || !rates) return null;
  const value = convertFromXof(amountXof, currency, rates);
  return value === null ? null : formatApprox(value, currency);
}
