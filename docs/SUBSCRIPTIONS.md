# ABONNEMENTS SaaS (Prompt 21)

Plans, usages et limites du workspace. Prix et limites restent **configurables
en base** (`0005_subscriptions.sql`) ; cette couche est un miroir de
consultation local (lecture seule) — la facturation, le changement de plan et
l'attribution sont gérés côté service plateforme (phase 04).

## Plans (miroir du seed 0005)

| Plan | Prix | Utilisateurs | Clients | Commandes | Stockage | WhatsApp | Stock | Audit |
|---|---|---|---|---|---|---|---|---|
| `FREE` | 0 | 1 | 30 | 60 | 200 Mo | ✗ | ✗ | ✗ |
| `BASIC` | 5 000 F CFA | 3 | 300 | 1 000 | 2 Go | ✓ | ✓ | ✗ |
| `PRO` | 10 000 F CFA | 15 | 5 000 | 20 000 | 10 Go | ✓ | ✓ | ✓ |

Catalogue : `src/domain/subscriptions/plans.ts` (`PLANS`, `getPlan`,
`isFeatureEnabled`). Montants en **centimes** (`price_monthly_cents`),
jamais de float ; les drapeaux `whatsapp` / `stock` / `audit` sont des limites
booléennes du plan.

## Usage & limites

`computeUsage` compte : membres `ACTIVE`, clients actifs, commandes en cours
(hors `CANCELLED`/`DELIVERED`), stockage (0 local, R2 en phase 05).
`resourcesFor` produit un état par ressource — `used`, `limit`,
`exceeded` (# dépassement) et `percent` borné.

## Service

`src/application/subscriptions/subscriptionService.ts` :

- `getOverview()` exige la permission **`subscriptions.view`**
  (OWNER et MANAGER ; refus `FORBIDDEN` pour EMPLOYEE/APPRENTICE) ;
- lit le miroir local `subscriptions` (entité par tenant) — absent → plan
  `FREE` / statut `TRIAL` par défaut ;
- agrège les usages réels du workspace et la liste des fonctionnalités
  (`FeatureStatus`) avec libellés français.

## Interface

`src/app/abonnement/page.tsx` (prérendu) → `src/features/subscriptions/` :

- carte du plan actuel (prix F CFA/mois, statut, prochaine échéance),
- jauges d'usage par ressource avec signalement de dépassement,
- grille des fonctionnalités incluses,
- comparaison `FREE` / `BASIC` / `PRO` (highlight du plan actuel),
  changement de plan explicité comme action plateforme en ligne (pas de fake).

## Fichiers

| Fichier | Rôle |
|---|---|
| `src/domain/subscriptions/plans.ts` | catalogue, usage, limites, `formatXof` |
| `src/application/subscriptions/subscriptionService.ts` | aperçu + permissions |
| `src/features/subscriptions/*` | facade + UI + constantes |
| `src/app/abonnement/page.tsx` | route `/abonnement` |

## Tests

- `tests/unit/subscriptions/plans.test.ts` — miroir 0005, drapeaux,
  comptage d'usages, dépassements, formats.
- `tests/integration/subscriptions/subscriptionService.test.ts` — défaut
  FREE/TRIAL, usages réels, plan BASIC stocké, refus EMPLOYEE
  (`subscriptions.view`).

Total suite : **171 tests**, typecheck/eslint/build verts.