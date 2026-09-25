---
name: atelierflow-design-system
description: Use when building, styling, or auditing UI screens, components, tokens, or the theme of the atelierflow SaaS. Covers the premium sewing-atelier design system (palette chocolat/beige/ivoire/champagne/anthracite), typography, spacing, radius, shadows, breakpoints 320-1920, mobile-first, accessibility, touch-friendly, states (loading/empty/error/success/offline/sync). Trigger keywords: design system, theme, tokens, palette, composant, component, responsive, breakpoint, layout, style, UI, CSS.
---

# atelierflow-design-system

Direction : **premium, sérieuse, moderne, atelier de couture**. Pas de générique d'admin, pas de surcharge. Mobile-first, tactile, accessible.

## Tokens

- **couleur**
  - chocolat profond : `#3E2723` (primary / fonds et titres)
  - beige chaud : `#D9C4A5` (surfaces secondaires)
  - ivoire : `#F8F4EA` (fond principal)
  - champagne doré discret : `#C6A664` (accents, prix)
  - anthracite : `#2B2B2E` (texte)
  - vert succès : `#2E7D32`
  - rouge/orange alertes : `#C62828` (erreur) / `#E65100` (alerte)
- **typographie** : sérif haut de gamme pour les titres (marque atelier), sans-serif lisible pour l'interface ; échelle prédéfinie 12–48 px ; `line-height` confortable.
- **spacing** : échelle 4 px (4, 8, 12, 16, 20, 24, 32, 40, 48, 64).
- **radius** : 6/10/16 px (inputs/cards/modales).
- **shadows** : douces, low-elevation, jamais d'ombre dure.
- **breakpoints** : 320, 360, 375, 390, 414, 480, 640, 768, 820, 912, 1024, 1280, 1366, 1440, 1536, 1920.

## Composants (construire avec tokens, sans surcharge)

buttons, inputs, selects, cards, tables, badges, dialogs, drawers, tabs, dropdowns, toasts, navigation, calendrier, charts, kanban, timeline.
États systématiques : **loading, empty, error, success, offline, sync** pour chaque vue de données.

## Règles d'implémentation

- Mobile-first : le design commence à 320 px, le desktop étend.
- A11y : contraste AA minimum, focus visibles, `aria` correcte, cibles tactiles ≥ 44×44 px.
- Touch-friendly : gestes simples, pas de hover comme seul révélateur.
- Zéro scroll horizontal involontaire ; textes jamais tronqués aux breakpoints listés.
- Nommage des classes via tokens (CSS vars) — pas de valeurs hex en dur dans les composants.
- La direction graphique (logoté, nom commercial) reste **configurable**, jamais figée sur "atelierflow".