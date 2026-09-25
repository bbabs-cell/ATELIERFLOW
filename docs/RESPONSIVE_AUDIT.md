# AUDIT RESPONSIVE (Prompt 24) — Rapport factuel

Audit par inspection des tokens et des composants, le 2026-09-25. Aucun
changement de code (constat + recommandations). Cible : mobile-first, tactile,
accessible, pas de scroll horizontal, breakpoints 320→1920.

## Bilan court

12 points vérifiés : **11 PASS**, **3 recommandations**, **0 rupture**
détectée aux breakpoints cibles. Conteneurs `max-w-5xl` + grilles `sm/lg`
unitaires sur toutes les vues.

---

## PASS

| # | Contrôle | Preuve |
|---|---|---|
| P1 | Tokens complets & breakpoints documentés | `src/ui/tokens.css` : palette chocolat/beige/ivoire/champagne/anthracite + sémantiques, radius 6/10/16, 3 ombres douces, breakpoints xs 24rem(320) → 3xl 96rem(1920) avec commentaire mobile-first. |
| P2 | Mobile-first réel | Base = mobile (`px-4`, une colonne), puis extensions `sm:`/`md:`/`lg:` (ex. `DashboardView.tsx:212` `grid-cols-2 lg:grid-cols-4`, `AbonnementView.tsx:125`, `TeamView.tsx:178` `max-w-5xl px-4 sm:py-10`). |
| P3 | Dialog : bottom-sheet mobile | `primitives/Dialog.tsx:61` `items-end sm:items-center sm:p-6` ; content `max-h-[70vh] overflow-y-auto` ; footer `flex-col-reverse` (l'action primaire est accessible en premier) puis `sm:flex-row`. |
| P4 | Drawer mobile/sidebar desktop | `AppShell.tsx` : header `h-14 lg:hidden`, sidebar `hidden w-64 lg:flex`, nav mobile dans un `Drawer` (backdrop, Échap, scroll-lock) — `Drawer.tsx:30-43`. |
| P5 | Pas de scroll horizontal de page | Tables emballées dans `overflow-x-auto` (`Table.tsx:11`) ; matrice permissions `TeamView.tsx:324` `overflow-x-auto` + `min-w-[560px]` (scroll contenu, page intacte) ; `Tabs.tsx:26` scroll de barre ; aucun `w-[px]` fixe au niveau page. |
| P6 | Truncation contrôlée | `truncate` + `min-w-0` dans listes (« DashboardView.tsx:172-175, ClientsList.tsx:94-108 », etc.) — textes jamais débordants, titres KPI conformes à 320. |
| P7 | Cibles tactiles | Saisies `min-h-11` (44 px) `fieldStyles.ts:6` ; bouton `md h-11` / `lg h-12` (`Button.tsx:34-35`) ; items nav `min-h-11` (`AppShell.tsx:41`). |
| P8 | Graphiques SVG responsives | `MiniChart.tsx` `viewBox` + `w-full preserveAspectRatio=none` → histogramme/spark s'adaptent sans lib externe. |
| P9 | États de données systématiques | `StateView.tsx` : 6 variantes (loading, empty, error, success, offline, sync) utilisées par chaque vue ; `OfflineBanner` (détection en ligne) et `SyncStatusChip` présents. |
| P10 | A11y de base | `:focus-visible` global (`tokens.css:129`) ; `aria-invalid` sur inputs ; `aria-props` (dialog, aria-modal, aria-current=page, aria-label sur boutons icône). |
| P11 | Hiérarchie visuelle aux petits formats | Titres `text-3xl sm:text-4xl`, cartes empilées, queues de boutons pleine largeur — pas d'éléments tronqués à 320–414. |

## Recommandations

**R1 — Contraste `ink-faint` (faible AA)** : `#a9a9af` (~2,4:1 sur blanc
ivoire) est utilisé pour des **informations utiles** (dates, montants
secondaires, intitulés de graphiques) dans ~40 occurrences des vues. Passer
ces textes informatifs sur `ink-soft` (#6b6b72, AA) et réserver `ink-faint`
aux placeholders/décoratifs (boutons icône `aria-hidden`, intitulés
`uppercase` de haut niveau). Non bloquant pour la préprod.

**R2 — Taille des contrôles compacts (mineure)** : `Button size="sm"` et
onglets `Tabs` font 36 px (`h-9`), en dessous de la cible 44 px. Acceptable
pour des contrôles secondaires ; s'assurer que les actions primaires restent
toujours `md` (44 px) et passer à 40 px minimum si un contrôle compact devient
un chemin d'action fréquent.

**R3 — Navigation produit (observation)** : les vues produits (commandes,
clients, équipe…) sont des pages autonomes avec leur propre en-tête ;
`AppShell` (mobile-first : header + drawer ≤ lg, sidebar ≥ lg) n'est monté que
sur la page démo `/`. Le shell de navigation et le brand configurable (prop
`brand: ReactNode`) doivent être branchés sur toutes les routes au fil de la
phase 04 — sans refonte, l'infrastructure responsive est prête.

## Note breakpoints

`tokens.css` définit 8 points (xs→3xl) couvrant 320/360/375/390/414/480/640/
768/820/912/1024/1280/1366/1440/1536/1920 : les styles de base commencent à
320 et s'étendent — pas de media query desktop-first dans les composants
(audit : 0 `min-width`/`max-width` inversé sur les vues).

## Rappel

Épreuves du skill couvertes : zéro scroll horizontal involontaire ✓, textes
jamais tronqués aux breakpoints ✓, cibles tactiles ≥ 44 px sur les primaires ✓,
leçon de lecture : pas de hex en dur dans les composants ✓ (tout via tokens),
rendu des survols jamais seul révélateur des actions (drawer/dialog dediés) ✓.