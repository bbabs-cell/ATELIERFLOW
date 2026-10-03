---
name: atelierflow-design-system
description: Use when building, styling, or auditing UI screens, components, tokens, or the theme of the atelierflow SaaS. Covers the vivid animated design system (lavender-white neutrals and four role colors: violet structure, coral→pink action gradient, emerald green, red alert; MagyaPro family), typography, spacing, radius, shadows, breakpoints 320-1920, mobile-first, accessibility, touch-friendly, states (loading/empty/error/success/offline/sync). Trigger keywords: design system, theme, tokens, palette, composant, component, responsive, breakpoint, layout, style, UI, CSS.
---

# atelierflow-design-system

Direction (v2, demandée par le client, 2026-09) : **vivante, colorée, animée** — famille visuelle MagyaPro. Remplace la direction « sobre » du prompt 08. Mobile-first, tactile, accessible.

## Tokens (source : `src/ui/tokens.css`)

- **couleur** : palette v4 « vive » (demande du client, 2026-10-03) — fond blanc lavande `#f8f5ff`, texte `#1e1a2e`, et **quatre couleurs à rôle fixe** : VIOLET `#24105c`→`#7c5cf0` (`chocolat-*`, `azur-*`, `violet-*`) = structure (menu, bandeaux sombres, titres) ; CORAIL→ROSE `#ff4d2e`→`#ff2e7e` (`flamme-*`, `champagne-*`, dégradé `flamme`) = marque et actions ; VERT `#12c98a` (`menthe-*`) = argent encaissé, succès, WhatsApp ; ROUGE `#be123c`/`#e11d48` (`wax-*`, `danger`) = retards, annulations, erreurs, jamais décoratif. Pas de bleu ni d'or. Les animations ne changent pas. Contrastes vérifiés (texte secondaire ≥ 4,5:1).
- **dégradés** : `bg-flamme-gradient`, `bg-sunset-gradient`, `bg-ocean-gradient`, `bg-aurora-gradient`, `text-gradient`.
- **typographie** : Bricolage Grotesque (titres, `font-display`), Manrope (interface), DM Mono (étiquettes, chiffres, `font-mono`). Titres de page : classe `page-title`.
- **ombres** : `shadow-soft`, `shadow-lift`, `shadow-glow` (halo flamme), `shadow-neo` (décalée, boutons outline).
- **animations** : `animate-fade-up`, `pop`, `scale-in`, `blob`, `float`, `shimmer`, `gradient`, `marquee`, `grow-up`, `pulse-ring` ; utilitaires `stagger`, `shine`, `gradient-border` (contour arc-en-ciel au survol), `dot-grid`, `skeleton-shimmer` ; chiffres animés via `useCountUp`. Les mouvements continus sont coupés sous `prefers-reduced-motion`.
- **radius** : 8/12/20/28 px ; boutons et onglets en pilule.
- **breakpoints** : 320, 360, 375, 390, 414, 480, 640, 768, 820, 912, 1024, 1280, 1366, 1440, 1536, 1920.

## Composants (construire avec tokens)

buttons, inputs, selects, cards, tables, badges, dialogs, drawers, tabs, dropdowns, toasts, navigation, calendrier, charts, kanban, timeline.
États systématiques : **loading, empty, error, success, offline, sync** pour chaque vue de données.

## Règles d'implémentation

- Mobile-first : le design commence à 320 px, le desktop étend.
- A11y : contraste AA minimum, focus visibles, `aria` correcte, cibles tactiles ≥ 44×44 px.
- Touch-friendly : gestes simples, pas de hover comme seul révélateur.
- Zéro scroll horizontal involontaire ; textes jamais tronqués aux breakpoints listés.
- Nommage des classes via tokens (CSS vars) — pas de valeurs hex en dur dans les composants.
- La direction graphique (logoté, nom commercial) reste **configurable**, jamais figée sur "atelierflow".