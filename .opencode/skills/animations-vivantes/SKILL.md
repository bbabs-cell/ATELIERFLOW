---
name: animations-vivantes
description: Use when building or restyling a web UI (Next.js / React / Tailwind v4) that must feel vivid, premium and animated — the "MagyaPro / atelierflow" motion style. Covers entrance animations (fade-up, scale-in, pop, staggered lists), hover micro-interactions (lift, shine sweep, animated gradient border, icon tilt), ambient backgrounds (drifting blurred blobs, dot grid, animated gradients, marquee ticker), data motion (count-up numbers, growing bars, shimmer skeletons, pulse rings) and modals/drawers — with performance and accessibility rules (prefers-reduced-motion, transform/opacity only). Trigger keywords: animation, animé, animations, motion, micro-interaction, hover, transition, keyframes, vivant, premium, effet, fade, stagger, shimmer, blob, count-up, marquee, gradient animé.
---

# Animations vivantes (style MagyaPro / atelierflow)

Une interface **vivante mais calme** : tout ce qui apparaît glisse doucement, tout ce qui se
touche réagit, le fond respire lentement, et rien ne gêne la lecture ni la saisie.
Réalisé en CSS pur (Tailwind v4 + `@keyframes`), sans librairie d'animation.

Fichiers prêts à copier dans un autre projet :

- [`animations.css`](animations.css) : jetons `--animate-*`, `@keyframes`, utilitaires
  (`stagger`, `shine`, `gradient-border`, `text-gradient`, `skeleton-shimmer`, `dot-grid`,
  `page-title`) et la coupure `prefers-reduced-motion`. À importer après `tailwindcss`.
- [`react.tsx`](react.tsx) : `useCountUp`, `AnimatedNumber`, `AmbientBlobs`, `CoverBackdrop`,
  `TypingDots` et des recettes de classes (cartes, boutons, menu, modale, graphiques).

## Installation dans un nouveau projet

1. Copier `animations.css` dans le projet (ex. `src/ui/animations.css`) et l'importer :
   `@import "tailwindcss"; @import "./animations.css";`
2. Régler les 6 couleurs de marque en haut du fichier (`--anim-brand-*`, `--anim-dark`,
   `--anim-light`) : tout le reste en découle (dégradés, halos, anneaux).
3. Copier les composants voulus depuis `react.tsx` (`"use client"`).
4. Vérifier avec « Réduire les animations » activé dans le système : plus aucun
   mouvement continu, les pages restent complètes et lisibles.

## Le vocabulaire (quoi utiliser où)

| Effet | Classe | Où l'utiliser |
|---|---|---|
| Entrée de bloc | `animate-fade-up` (0,55 s, montée de 16 px) | contenu de page, bandeaux, messages de statut |
| Entrée en cascade | `stagger` sur le parent | listes, grilles de cartes, menus, KPI (décalage 50 ms, plafonné à 0,42 s) |
| Fenêtre / carte qui s'ouvre | `animate-scale-in` | modales, toasts, popovers, résultats de recherche |
| Voile de fond | `animate-fade-in` | arrière-plan de modale / tiroir |
| Tiroir latéral | `animate-slide-in-left/right` | menu mobile, panneaux |
| Pastille, badge, compteur | `animate-pop` (léger rebond) ; `key={valeur}` pour rejouer à chaque changement | badges, nombre de rappels, étiquettes |
| Attirer l'œil sur une action due | `animate-pulse-ring` (anneau qui s'élargit) | icône « à faire maintenant » ; jamais plus d'une par écran |
| Alerte visible | `animate-wiggle` (une fois) | message d'erreur d'action refusée, emoji de bienvenue |
| Décor flottant | `animate-float` (5 s) | petite icône décorative, étincelle d'état vide |
| Fond vivant | `<AmbientBlobs />` (`animate-blob`, 14 s, délais négatifs) | derrière le contenu, en `fixed` ; version `dark` sur bandeau sombre |
| Trame | `dot-grid` (sombre) / `dot-grid-ink` (clair) | menu, en-têtes, bandeaux |
| Dégradé qui bouge | `bg-*-gradient` + `animate-gradient` ; `text-gradient` pour un mot | bouton principal, point final des titres, mot clé d'un titre |
| Contour arc-en-ciel au survol | `gradient-border` | cartes cliquables, panneaux mis en avant |
| Reflet qui balaie | `shine` | bouton d'action principal |
| Défilement continu | `animate-marquee` sur une piste dupliquée `[...items, ...items]` | bandeau d'infos (chiffres du jour) |
| Barres qui poussent | `animate-grow-up` + `origin-bottom` + `animationDelay: i*70ms` | histogrammes |
| Nombres qui défilent | `useCountUp` / `<AnimatedNumber>` | KPI, montants du tableau de bord |
| Chargement | `skeleton-shimmer` aux dimensions du contenu final | toute liste ou carte en attente |
| Titre de page | `page-title` (entrée + point final en dégradé animé) | h1 de chaque page |

## Micro-interactions (survol, appui)

Toujours `transition-all duration-200|300` et seulement `transform`, `opacity`, `box-shadow`,
`background-color` :

- **Bouton** : `hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97]` ; principal
  avec `shadow-glow` (halo couleur de marque) ; contour « néo » `shadow-neo hover:shadow-neo-lg`.
- **Carte cliquable** : `group gradient-border hover:-translate-y-1 hover:shadow-lift` ;
  halo flou dans un coin qui grossit (`group-hover:scale-150 group-hover:opacity-40`) ;
  icône qui tourne un peu (`group-hover:rotate-[-10deg] group-hover:scale-110`) ;
  flèche qui part en diagonale (`group-hover:-translate-y-0.5 group-hover:translate-x-0.5`).
- **Élément de liste / menu** : `hover:translate-x-1` + fond teinté ; icône
  `group-hover:scale-110 group-hover:rotate-[-8deg]` ; élément actif : pastille `animate-pulse`.
- **Bouton fermer** : `hover:rotate-90`. **Bouton menu** : `hover:rotate-90` + fond de marque.
- **Image** : `group-hover:scale-105` dans un parent `overflow-hidden`.
- **Champ** : bordure de marque au survol, anneau doux au focus
  (`focus:shadow-[0_0_0_4px_rgb(… / 0.18)]`).

Le survol n'est **jamais** le seul moyen de voir une information : tout ce qui apparaît au
survol est visible d'office au doigt (`pointer-coarse:opacity-100`).

## Règles (à respecter à chaque fois)

1. **Performance** : n'animer que `transform` et `opacity` (et `background-position` pour
   les dégradés). Jamais `width/height/top/left/margin`. Les fonds animés sont
   `pointer-events-none`, `aria-hidden`, en `fixed` ou `absolute` derrière le contenu.
2. **Durées** : entrées 0,35–0,55 s ; survol 0,2–0,3 s ; décor continu 5–28 s. Courbe
   d'entrée `cubic-bezier(0.22, 1, 0.36, 1)` ; rebond `cubic-bezier(0.34, 1.56, 0.64, 1)`
   seulement pour les petites pastilles.
3. **Sobriété** : une seule chose qui attire l'œil par écran (`pulse-ring`, `wiggle`).
   Pas d'animation continue sur du texte à lire, sauf le point final du titre et le
   bandeau défilant.
4. **Accessibilité** : la règle `prefers-reduced-motion` de `animations.css` coupe tout
   mouvement continu et raccourcit les transitions ; `useCountUp` affiche directement la
   valeur finale. Contraste AA sur les dégradés (teintes assez foncées pour du texte blanc).
5. **Exactitude** : un nombre animé finit **toujours** exactement sur la vraie valeur
   (entiers, dernière image = cible). Ne jamais animer un montant dans un document
   (reçu, PDF, export).
6. **Rejouer volontairement** : pour relancer `animate-pop` quand une valeur change,
   mettre la valeur en `key` (`<span key={count} className="animate-pop">`). Pour
   rejouer l'entrée d'une page, clé sur le chemin (`key={pathname}`).
7. **Impression** : `print:hidden` sur les boutons flottants et décors.
8. **Ne pas casser l'existant** : quand le client a validé les animations, on n'y touche
   pas en retouchant les couleurs ou la mise en page.

## Vérifier

- Parcourir les écrans à 320, 390, 768, 1280 et 1920 px : aucune animation ne crée de
  défilement horizontal (les blobs sont dans un parent `overflow-hidden` /
  `overflow-x-clip`).
- Activer « Réduire les animations » : rien ne bouge en continu, tout reste visible.
- Outils de performance du navigateur : pas de « Layout » pendant les animations.
