# Navigation

## Le problème

Au téléphone, tout passait par le bouton ☰ : deux gestes pour changer d'écran, des dizaines
de fois par jour (prendre une commande, retrouver un client, voir les rendez-vous). Et le
menu montrait à un apprenti des écrans qu'il ne pouvait pas ouvrir (Rapports, Équipe,
Abonnement) : il tombait sur un refus.

## Ce que ça fait

- **Barre du bas** (téléphone et tablette, sous 1024 px) : les 4 écrans les plus ouverts —
  Tableau de bord, Commandes, Clients, Rendez-vous — et « Plus », qui ouvre le menu complet.
  Si le rôle n'a pas accès à l'un d'eux, le suivant autorisé prend sa place (Stock, Mes
  modèles).
- **Menu selon le rôle** : une entrée que le rôle ne peut pas ouvrir n'est plus affichée
  (droit requis par entrée dans `AuthGate`). Le serveur refuse de toute façon ; on évite
  seulement l'impasse. Rôle inconnu (démo, ancien jeton) : tout reste visible.
- Sur ordinateur (1024 px et plus), rien ne change : barre latérale.

## Règles et pourquoi

- La barre est placée **hors du contenu animé** : une transformation d'entrée sur un parent
  capturerait l'élément fixé en bas (il disparaîtrait de l'écran).
- Sa hauteur est publiée dans `--bottom-nav` (`globals.css`, `:has([data-bottom-nav])`) :
  la bulle de l'assistant, les messages et l'invitation de mise à jour se posent au-dessus,
  et la fin de chaque page reste visible (`pb-[calc(6rem+var(--bottom-nav))]`).
- `pb-[env(safe-area-inset-bottom)]` : rien sous la barre d'accueil de l'iPhone.
- Entrée active : couleur de sa fonctionnalité en texte (contraste ≥ 4,5:1), pas de
  pastille pleine — la couleur pleine reste au bouton principal de l'écran.

## Fluidité (2026-10-14)

Mesuré image par image (téléphone simulé, processeur ×4) : chaque changement d'écran
donnait 0,15 à 0,5 s d'écran blanc — l'entrée de page partait de l'opacité 0 (0,55 s) et les
listes attendaient jusqu'à 0,42 s. Désormais : entrée de page `animate-page-in` (0,2 s, part
de 0,55 d'opacité), cascades plafonnées à 0,2 s, aucun bloc ne part de l'opacité 0, écran de
chargement visible dès la première image, chiffres du tableau de bord rafraîchis sans
repasser par le squelette, et une **barre de progression fine** en haut répond dès le
toucher d'un lien (`src/features/navigation/NavProgress.tsx`).

## Défilement sans écran blanc (2026-10-14)

Signalé au téléphone : pendant le défilement, des zones restaient blanches et l'image ne
revenait qu'au lâcher. Cause mesurée : flou d'arrière-plan (`backdrop-blur`) sur 23 cartes,
listes et barres — recalculé à chaque image du défilement — par-dessus des taches floues
animées en continu, plus des dégradés animés qui redessinaient l'écran 60 fois par seconde
même au repos. Correctifs : fonds opaques sans flou sur tout ce qui défile ; sur écran
tactile (`hover: none`), aucune animation continue et fond d'ambiance en dégradés fixes
(`ambient-static`) ; la bordure animée des cartes ne tourne qu'au survol. Mesure
(tableau de bord, processeur ×4) : peinture + rastérisation pendant le défilement
1 100 ms → 14 ms ; au repos 118 images redessinées en 2 s → 0. Sur ordinateur, le décor
vivant reste.

## Code

`src/domain/navigation/nav.ts` (choix des entrées, testé : `tests/unit/navigation`),
`src/ui/composites/AppShell.tsx` (barre), `src/features/auth/AuthGate.tsx` (droits par entrée).

## À faire côté propriétaire

Rien.
