import { currencyInfo } from "@/domain/geo/countries";
import { getActiveCurrency } from "@/domain/money";
/**
 * Montant en toutes lettres (français, orthographe traditionnelle avec
 * traits d'union) : « Arrêté le présent reçu à la somme de … francs CFA ».
 * Entiers positifs uniquement, comme toutes les sommes en F CFA.
 */

const UNITS = [
  "zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf",
  "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize",
  "dix-sept", "dix-huit", "dix-neuf",
];
const TENS = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante"];

/** 0 → 99 ; `final` : « quatre-vingts » seulement en fin de nombre. */
function below100(n: number, final: boolean): string {
  if (n < 20) return UNITS[n];
  if (n < 70) {
    const t = Math.floor(n / 10);
    const u = n % 10;
    if (u === 0) return TENS[t];
    if (u === 1) return `${TENS[t]} et un`;
    return `${TENS[t]}-${UNITS[u]}`;
  }
  if (n < 80) {
    // 70 → 79 : soixante-dix, soixante et onze, soixante-douze…
    const rest = n - 60;
    return rest === 11 ? "soixante et onze" : `soixante-${UNITS[rest]}`;
  }
  // 80 → 99 : quatre-vingts, quatre-vingt-un, quatre-vingt-dix…
  const rest = n - 80;
  if (rest === 0) return final ? "quatre-vingts" : "quatre-vingt";
  return `quatre-vingt-${UNITS[rest]}`;
}

/** 0 → 999. */
function below1000(n: number, final: boolean): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (h === 0) return below100(r, final);
  const head = h === 1 ? "cent" : `${UNITS[h]} cent${r === 0 && final ? "s" : ""}`;
  return r === 0 ? head : `${head} ${below100(r, final)}`;
}

const SCALES: Array<{ value: number; singular: string; plural: string }> = [
  { value: 1_000_000_000, singular: "milliard", plural: "milliards" },
  { value: 1_000_000, singular: "million", plural: "millions" },
];

export function numberToFrenchWords(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("AMOUNT_INVALID");
  }
  if (value === 0) return UNITS[0];
  let rest = value;
  const parts: string[] = [];
  for (const scale of SCALES) {
    const count = Math.floor(rest / scale.value);
    if (count > 0) {
      // « millions » / « milliards » sont des noms : le nombre devant reste au pluriel.
      parts.push(`${numberToFrenchWords(count)} ${count > 1 ? scale.plural : scale.singular}`);
      rest %= scale.value;
    }
  }
  const thousands = Math.floor(rest / 1000);
  const units = rest % 1000;
  if (thousands > 0) {
    // « mille » est invariable ; « deux cent mille », « quatre-vingt mille ».
    parts.push(thousands === 1 ? "mille" : `${below1000(thousands, false)} mille`);
  }
  if (units > 0) parts.push(below1000(units, true));
  return parts.join(" ");
}

/** « cinquante mille francs CFA » ; « un franc CFA ». */
export function fcfaInWords(amount: number, currency: string = getActiveCurrency()): string {
  const words = numberToFrenchWords(amount);
  const info = currencyInfo(currency);
  return `${words} ${amount > 1 ? info.plural : info.singular}`;
}
