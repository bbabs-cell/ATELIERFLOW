/**
 * Champ « fichier » caché mais toujours atteignable au clavier.
 *
 * Pas `sr-only` : ce champ est en position absolue à sa place dans la page ;
 * quand le navigateur lui rend le focus (retour de l'appareil photo sur
 * téléphone), il fait défiler jusqu'à lui le conteneur le plus proche —
 * même une fenêtre `overflow: hidden`, qui restait alors décalée vers le
 * haut, le reste de l'écran vide. En `fixed` dans le coin de l'écran, il est
 * toujours « visible » : aucun défilement n'est déclenché.
 */
export const HIDDEN_FILE_INPUT = "pointer-events-none fixed left-0 top-0 size-px opacity-0";
