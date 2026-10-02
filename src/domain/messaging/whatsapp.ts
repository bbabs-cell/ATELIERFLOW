/**
 * WhatsApp « click-to-chat » (wa.me) — sans API Business : l'application
 * prépare le message, l'utilisateur le relit, le modifie puis l'envoie
 * lui-même depuis WhatsApp.
 */

/**
 * Indicatifs pays reconnus pour compléter un numéro local avec l'indicatif
 * de l'atelier (Afrique de l'Ouest et centrale, Maghreb, France…). Aucun
 * indicatif de la liste n'est le préfixe d'un autre : l'ordre est libre.
 */
const COUNTRY_CODES = [
  "221", "222", "223", "224", "225", "226", "227", "228", "229", "230", "231", "232", "233", "234", "235",
  "236", "237", "238", "239", "240", "241", "242", "243", "244", "245", "250", "211", "212", "213", "216",
  "261", "33", "32", "41", "1",
];

/**
 * Pays où le 0 initial fait partie du numéro international (Côte d'Ivoire
 * depuis 2021 : +225 07…, Congo : +242 06…) ; ailleurs il est retiré
 * (France : 06… → +33 6…).
 */
const KEEP_LEADING_ZERO = new Set(["225", "242"]);

function compact(raw: string): string {
  return raw.replace(/[\s.\-()/]/g, "");
}

/** Indicatif pays d'un numéro international (« +221 33… » → « 221 »). */
export function countryCodeOf(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const c = compact(phone);
  const digits = c.startsWith("+") ? c.slice(1) : c.startsWith("00") ? c.slice(2) : null;
  if (!digits || !/^\d+$/.test(digits)) return null;
  return COUNTRY_CODES.find((code) => digits.startsWith(code)) ?? null;
}

/**
 * Numéro au format attendu par wa.me (chiffres, indicatif inclus, sans
 * « + »). Un numéro local est complété avec `defaultCountryCode` (celui de
 * l'atelier) ; le 0 de tête national est retiré quand le pays l'exige.
 * null si inexploitable.
 */
export function toWhatsappNumber(raw: string | null | undefined, defaultCountryCode: string | null = null): string | null {
  if (!raw) return null;
  const c = compact(raw);
  let digits: string | null = null;
  if (c.startsWith("+")) digits = c.slice(1);
  else if (c.startsWith("00")) digits = c.slice(2);
  else if (defaultCountryCode && /^\d{6,12}$/.test(c)) {
    digits = defaultCountryCode + (KEEP_LEADING_ZERO.has(defaultCountryCode) ? c : c.replace(/^0/, ""));
  }
  return digits && /^\d{8,15}$/.test(digits) ? digits : null;
}

/** Lien wa.me : conversation directe si le numéro est connu, sinon choix du contact. */
export function whatsappUrl(number: string | null, text: string): string {
  const query = `text=${encodeURIComponent(text)}`;
  return number ? `https://wa.me/${number}?${query}` : `https://wa.me/?${query}`;
}

/** Limite pratique d'un message prérempli (les URL très longues sont tronquées). */
export const WHATSAPP_MESSAGE_MAX = 1500;
