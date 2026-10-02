/**
 * Montants : francs CFA (XOF) ENTIERS, sans sous-unité — même unité que
 * les colonnes `bigint` de la base (0001/0002 : « FCFA entiers »). Aucune
 * conversion entre l'écran, IndexedDB, la synchronisation et Postgres :
 * 50 000 F CFA saisis = 50000 partout. Jamais de float.
 */
export const CURRENCY = "XOF";

/**
 * Lit un montant saisi en F CFA : chiffres, espaces ou points comme
 * séparateurs de milliers (« 50 000 », « 50.000 »), suffixe « F », « FCFA »
 * ou « F CFA » toléré. Refuse décimales, signes et notations exotiques.
 */
export function parseFcfa(input: string): number | null {
  const normalized = input
    .trim()
    .replace(/\s*(f\s*cfa|fcfa|f|xof)$/i, "")
    .replace(/[  \s]/g, "");
  if (!/^\d{1,3}(\.\d{3})+$|^\d+$/.test(normalized)) return null;
  const value = Number(normalized.replace(/\./g, ""));
  return Number.isSafeInteger(value) ? value : null;
}

function groupThousands(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** « 50 000 F CFA » (espaces insécables) ; négatif = crédit/surplus. */
export function formatFcfa(amount: number): string {
  const abs = Math.abs(Math.trunc(amount));
  const sign = amount < 0 ? "-" : "";
  return `${sign}${groupThousands(abs)} F CFA`;
}

export function lineTotal(source: {
  quantity: number;
  unitPrice: number;
}): number | null {
  if (!Number.isSafeInteger(source.unitPrice) || source.unitPrice < 0) return null;
  if (!Number.isSafeInteger(source.quantity) || source.quantity <= 0) return null;
  const total = source.quantity * source.unitPrice;
  return Number.isSafeInteger(total) ? total : null;
}

export function sumAmounts(amounts: readonly number[]): number | null {
  let total = 0;
  for (const amount of amounts) {
    if (!Number.isSafeInteger(amount) || amount < 0) return null;
    total += amount;
    if (!Number.isSafeInteger(total)) return null;
  }
  return total;
}
