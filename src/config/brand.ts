/**
 * Marque affichée (écrans, onglets, reçus PDF). Seul endroit à modifier
 * pour changer de nom : aucun texte visible ne doit écrire la marque en dur.
 * NEXT_PUBLIC_BRAND_NAME permet de la changer sans toucher au code.
 *
 * Les préfixes techniques « atelierflow » (base locale IndexedDB, caches du
 * service worker) ne sont jamais visibles et restent tels quels : les
 * renommer effacerait les données hors ligne déjà enregistrées.
 */
export const BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME?.trim() || "Atelier";
export const BRAND_TAGLINE = "Gestion d'atelier de couture";
