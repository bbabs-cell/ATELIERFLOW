import { currencyInfo } from "@/domain/geo/countries";

/**
 * Montants : ENTIERS dans la monnaie de l'atelier, sans sous-unité — même
 * unité que les colonnes `bigint` de la base. XOF (F CFA) par défaut ;
 * chaque atelier a sa monnaie (0026 : tenants.currency). Aucune
 * conversion entre l'écran, IndexedDB, la synchronisation et Postgres :
 * 50 000 saisis = 50000 partout. Jamais de float.
 */
export const CURRENCY = "XOF";

let activeCurrency = CURRENCY;

/** Monnaie de l'atelier de la session : posée par la barrière d'authentification. */
export function setActiveCurrency(code: string | null | undefined): void {
  activeCurrency = code && /^[A-Z]{3}$/.test(code) ? code : CURRENCY;
}

export function getActiveCurrency(): string {
  return activeCurrency;
}

/**
 * Lit un montant entier saisi : chiffres, espaces ou points comme
 * séparateurs de milliers (« 50 000 », « 50.000 »), suffixe de monnaie
 * toléré (« F CFA », « FCFA », « F », « GNF », « € », « DH »…). Refuse
 * décimales, signes et notations exotiques.
 */
export function parseFcfa(input: string): number | null {
  const normalized = input
    .trim()
    .replace(/\s*(f\s*cfa|fcfa|f|xof|xaf|[a-z]{3}|€|\$|£|₦|dh|da|dt|fc|ar)$/i, "")
    .replace(/[  \s]/g, "");
  if (!/^\d{1,3}(\.\d{3})+$|^\d+$/.test(normalized)) return null;
  const value = Number(normalized.replace(/\./g, ""));
  return Number.isSafeInteger(value) ? value : null;
}

export function groupThousands(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** « 50 000 F CFA », « 85 € », « 150 000 GNF » ; négatif = crédit/surplus. */
export function formatMoney(amount: number, currency: string = activeCurrency): string {
  const abs = Math.abs(Math.trunc(amount));
  const sign = amount < 0 ? "-" : "";
  return `${sign}${groupThousands(abs)}\u00a0${currencySymbol(currency)}`;
}

/** Symbole de la monnaie de l'atelier (« F CFA », « € »…), pour les libellés. */
export function currencySymbol(currency: string = activeCurrency): string {
  // espaces insécables : « F CFA » ne se coupe jamais en fin de ligne
  return currencyInfo(currency).symbol.replace(/ /g, "\u00a0");
}

/** Montant dans la monnaie de l'atelier (nom historique, utilisé partout). */
export function formatFcfa(amount: number): string {
  return formatMoney(amount);
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
