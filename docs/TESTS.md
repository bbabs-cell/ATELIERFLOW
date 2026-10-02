# TESTS (Prompt 22) — Vue d'ensemble

Suite **Vitest** (`npm test`). Typecheck (`npm run typecheck`) et ESLint
(`npm run lint`) systématiquement, build Next aussi à la fin de chaque prompt.

## Positionnement

- **Unitaires** : domaine pur (hormis accès `indexedDB`) — règles métier,
  validation, arithmétique exacte, transformations.
- **Intégration** : services applicatifs branchés sur les vrais repositories
  locaux (`fake-indexeddb/auto`), le `SyncEngine`, et le serveur de sync simulé
  (`tests/support/fakeSyncServer.ts` — idempotence, conflits, échecs).
- **E2E fil de l'eau** : un parcours métier complet traversant plusieurs
  domaines, puis flush vers le pseudo-serveur.

## Inventaire (27 fichiers, 180 tests)

| Dossier | Couvre |
|---|---|
| `unit/clients` | clients, mesures, `normalizePhone` |
| `unit/orders` | argent (`formatEuros`, arrondis), commandes, paiements/solde, reçus |
| `unit/inventory` | unités centi‑décimales, tissus, mouvements de stock |
| `unit/appointments` | RDV + notifications |
| `unit/team` | rôles/permissions (miroir 0007), invités/désactivation, dernier OWNER |
| `unit/sync` | file (`queuePolicy`), résolution de conflits, cache PWA |
| `unit/ids` | idempotence |
| `unit/dashboard` | KPI/points de revenus, recherche (normalisation, builders, limites) |
| `unit/subscriptions` | catalogue miroir 0005, usage/limites, devise |
| `integration/clients` | service clients end‑to‑end local |
| `integration/orders` | commandes, paiements (solde exact), reçus (`REC-`) |
| `integration/stock` | création fabric, entrées/sorties/ajustement |
| `integration/appointments` | service RDV |
| `integration/team` | gestion d'équipe + permission `team.read/manage` |
| `integration/dashboard` | KPI gate `reports.read`, recherche scopée (APPRENTICE refusé) |
| `integration/subscriptions` | plan défaut FREE/TRIAL, usages réels, `subscriptions.view` |
| `integration/sync` | flush, idempotence (`pushedCount`/`appliedCount`), conflits |
| `integration/e2e` | parcours complet (client → commande → paiement → reçu → RDV → stock → flush serveur) |

## Conventions des tests

- Harness : `uniqueTenant()` du style `00000000-0000-4000-8000-00000000XX`,
  horloge `t = 1_767_225_599_000`, uuid client `20000000-…`, engine
  `30000000-…`, `createFakeSyncServer().pushed()`.
- Argent/stock : entiers **F CFA / centi-units (mètres)** — jamais de `float` ;
  les assertions vérifient les totaux exacts (`41_000`, `750`).
- Permissions : les rôles reflètent le seed `0007_rbac.sql` (EMPLOYEE a
  `reports.read` mais pas `subscriptions.view`/`team.read` …) ; les refus
  `FORBIDDEN` sont testés avec des rôles réellement dépourvus de la
  permission (ex. APPRENTICE pour les KPI).

## Notes d'exécution

- Mode `MOBILE_MONEY` n'existe pas : modes = `CASH, ORANGE_MONEY, MOOV_MONEY,
  WAVE, TRANSFER, OTHER`.
- Types RDV : `MEASUREMENTS, FITTING, ALTERATION, DELIVERY, PICKUP, PAYMENT,
  OTHER`.
- `FabricRecord` porte `quantity` (centi‑units) — pas `stock_centi`.

## État

- **180 tests** (27 fichiers), typecheck/eslint/build verts.
- Contre-exemples couverts : montants invalides, types inconnus, doublons de
  référence de reçu, déplacement négatif de stock, suppression interdite,
  changement de rôle auto, dernier OWNER, permissions manquantes.