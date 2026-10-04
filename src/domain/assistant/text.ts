/**
 * Outils de texte de l'assistant : les questions sont comparées sans
 * accents, sans majuscules ni ponctuation (« Où est mon reçu ? » →
 * « ou est mon recu »).
 */

export function normalizeText(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’`]/g, " ")
    .replace(/[^a-z0-9-]+/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Le texte normalisé contient-il l'expression ? Mots entiers, le dernier
 * pouvant être prolongé (« commande » trouve « commandes ») ; une
 * expression terminée par « ! » doit correspondre au mot exact (« pro! »
 * ne trouve pas « profil »).
 */
export function hasPhrase(normalized: string, phrase: string): boolean {
  const exact = phrase.endsWith("!");
  const p = normalizeText(exact ? phrase.slice(0, -1) : phrase);
  if (!p) return false;
  return ` ${normalized} `.includes(exact ? ` ${p} ` : ` ${p}`);
}

/** Score d'une liste d'expressions : chaque expression trouvée compte selon sa longueur (les plus précises gagnent). */
export function phraseScore(normalized: string, phrases: readonly string[]): number {
  let score = 0;
  for (const phrase of phrases) {
    if (hasPhrase(normalized, phrase)) score += 1 + normalizeText(phrase).split(" ").length;
  }
  return score;
}

/** La question demande-t-elle « comment faire » plutôt qu'un chiffre ? */
export function isHowTo(normalized: string): boolean {
  return phraseScore(normalized, [
    "comment",
    "ou est",
    "ou se trouve",
    "ou trouver",
    "ou je",
    "ou puis",
    "je veux ajouter",
    "je veux mettre",
    "je veux changer",
    "faire pour",
    "faut il",
    "explique",
    "expliquer",
    "aide moi",
    "how",
    "possible de",
    "peut on",
    "est ce qu on peut",
    "je n arrive pas",
    "je narrive pas",
    "j arrive pas",
  ]) > 0;
}
