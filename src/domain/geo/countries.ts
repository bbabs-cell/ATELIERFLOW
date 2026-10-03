/**
 * Pays proposés à l'inscription et monnaie de l'atelier.
 *
 * Les montants restent des ENTIERS dans la monnaie de l'atelier (comme le
 * F CFA depuis le début) : 85 € s'écrit 85, 150 000 GNF s'écrit 150000.
 * Pas de centimes : un atelier fixe ses prix en unités entières.
 */
export interface CurrencyInfo {
  code: string;
  /** Après le montant : « 50 000 F CFA », « 85 € ». */
  symbol: string;
  /** Pour « Arrêté à la somme de … » sur les reçus. */
  singular: string;
  plural: string;
}

export const CURRENCIES: Record<string, CurrencyInfo> = {
  XOF: { code: "XOF", symbol: "F CFA", singular: "franc CFA", plural: "francs CFA" },
  XAF: { code: "XAF", symbol: "F CFA", singular: "franc CFA", plural: "francs CFA" },
  GNF: { code: "GNF", symbol: "GNF", singular: "franc guinéen", plural: "francs guinéens" },
  CDF: { code: "CDF", symbol: "FC", singular: "franc congolais", plural: "francs congolais" },
  KMF: { code: "KMF", symbol: "FC", singular: "franc comorien", plural: "francs comoriens" },
  RWF: { code: "RWF", symbol: "FRw", singular: "franc rwandais", plural: "francs rwandais" },
  BIF: { code: "BIF", symbol: "FBu", singular: "franc burundais", plural: "francs burundais" },
  DJF: { code: "DJF", symbol: "FDJ", singular: "franc djiboutien", plural: "francs djiboutiens" },
  MRU: { code: "MRU", symbol: "MRU", singular: "ouguiya", plural: "ouguiyas" },
  MAD: { code: "MAD", symbol: "DH", singular: "dirham", plural: "dirhams" },
  DZD: { code: "DZD", symbol: "DA", singular: "dinar algérien", plural: "dinars algériens" },
  TND: { code: "TND", symbol: "DT", singular: "dinar tunisien", plural: "dinars tunisiens" },
  GMD: { code: "GMD", symbol: "GMD", singular: "dalasi", plural: "dalasis" },
  NGN: { code: "NGN", symbol: "NGN", singular: "naira", plural: "nairas" },
  GHS: { code: "GHS", symbol: "GHS", singular: "cedi", plural: "cedis" },
  MGA: { code: "MGA", symbol: "Ar", singular: "ariary", plural: "ariarys" },
  EUR: { code: "EUR", symbol: "€", singular: "euro", plural: "euros" },
  CHF: { code: "CHF", symbol: "CHF", singular: "franc suisse", plural: "francs suisses" },
  CAD: { code: "CAD", symbol: "$ CA", singular: "dollar canadien", plural: "dollars canadiens" },
  USD: { code: "USD", symbol: "$ US", singular: "dollar américain", plural: "dollars américains" },
  GBP: { code: "GBP", symbol: "£", singular: "livre sterling", plural: "livres sterling" },
};

export interface Country {
  code: string;
  name: string;
  currency: string;
}

export const COUNTRIES: readonly Country[] = [
  { code: "SN", name: "Sénégal", currency: "XOF" },
  { code: "CI", name: "Côte d'Ivoire", currency: "XOF" },
  { code: "ML", name: "Mali", currency: "XOF" },
  { code: "BF", name: "Burkina Faso", currency: "XOF" },
  { code: "NE", name: "Niger", currency: "XOF" },
  { code: "TG", name: "Togo", currency: "XOF" },
  { code: "BJ", name: "Bénin", currency: "XOF" },
  { code: "GW", name: "Guinée-Bissau", currency: "XOF" },
  { code: "CM", name: "Cameroun", currency: "XAF" },
  { code: "GA", name: "Gabon", currency: "XAF" },
  { code: "CG", name: "Congo", currency: "XAF" },
  { code: "TD", name: "Tchad", currency: "XAF" },
  { code: "CF", name: "Centrafrique", currency: "XAF" },
  { code: "GQ", name: "Guinée équatoriale", currency: "XAF" },
  { code: "GN", name: "Guinée", currency: "GNF" },
  { code: "CD", name: "RD Congo", currency: "CDF" },
  { code: "KM", name: "Comores", currency: "KMF" },
  { code: "RW", name: "Rwanda", currency: "RWF" },
  { code: "BI", name: "Burundi", currency: "BIF" },
  { code: "DJ", name: "Djibouti", currency: "DJF" },
  { code: "MR", name: "Mauritanie", currency: "MRU" },
  { code: "MA", name: "Maroc", currency: "MAD" },
  { code: "DZ", name: "Algérie", currency: "DZD" },
  { code: "TN", name: "Tunisie", currency: "TND" },
  { code: "GM", name: "Gambie", currency: "GMD" },
  { code: "NG", name: "Nigeria", currency: "NGN" },
  { code: "GH", name: "Ghana", currency: "GHS" },
  { code: "MG", name: "Madagascar", currency: "MGA" },
  { code: "FR", name: "France", currency: "EUR" },
  { code: "BE", name: "Belgique", currency: "EUR" },
  { code: "IT", name: "Italie", currency: "EUR" },
  { code: "ES", name: "Espagne", currency: "EUR" },
  { code: "DE", name: "Allemagne", currency: "EUR" },
  { code: "CH", name: "Suisse", currency: "CHF" },
  { code: "GB", name: "Royaume-Uni", currency: "GBP" },
  { code: "CA", name: "Canada", currency: "CAD" },
  { code: "US", name: "États-Unis", currency: "USD" },
];

/** Liste triée pour les menus déroulants. */
export const COUNTRY_OPTIONS: readonly Country[] = [...COUNTRIES].sort((a, b) => a.name.localeCompare(b.name, "fr"));

export function countryByCode(code: string | null | undefined): Country | null {
  if (!code) return null;
  return COUNTRIES.find((c) => c.code === code.toUpperCase()) ?? null;
}

export function currencyInfo(code: string | null | undefined): CurrencyInfo {
  return CURRENCIES[(code ?? "").toUpperCase()] ?? { code: code ?? "XOF", symbol: code ?? "F CFA", singular: code ?? "", plural: code ?? "" };
}

/** Pays proposé par défaut d'après la langue du navigateur (« fr-SN » → Sénégal). */
export function guessCountry(locale: string | undefined): string {
  const region = locale?.split("-")[1]?.toUpperCase();
  return region && countryByCode(region) ? region : "SN";
}
