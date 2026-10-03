# TESTS (Prompt 22) — Vue d'ensemble

Deux niveaux, tous deux lancés automatiquement par GitHub Actions
(`.github/workflows/ci.yml`) sur chaque PR et chaque push sur `main` :

| Commande | Ce qu'elle vérifie |
|---|---|
| `npm run lint` / `npm run typecheck` | ESLint, TypeScript |
| `npm test` | **Vitest** : application (domaine, services, file de sync) |
| `npm run build` | build Next, **sans aucun secret** |
| `npm run test:db` | **serveur** : base PostgreSQL vierge reconstruite depuis toutes les migrations, puis scénarios SQL (`supabase/validations/*_local.sql`) |

`test:db` lit la connexion dans les variables `PG*` et **détruit puis recrée**
la base `atelierflow_tests` : jamais contre la production.

## Les 7 tests critiques (prompt 22)

Chacun est vérifié côté serveur (vraie logique `sync_push`, RLS, triggers —
`supabase/validations/critical_local.sql`, 35 vérifications) et côté
application (Vitest).

| Cas | Serveur (`critical_local.sql`) | Application (Vitest) |
|---|---|---|
| 1. Paiement multiple | 1.a–f : 15 000 + 20 000 sur 40 000 → reste 5 000 ; +15 000 → surplus 10 000 ; montant ≤ 0 refusé | `unit/orders/payments`, `integration/orders/paymentService` |
| 2. Double synchronisation | 2.a–c : même clé rejouée, même paiement sous une autre clé, reçu rejoué → aucun doublon | `integration/sync/engine`, `unit/ids/idempotency` |
| 3. Cross-tenant | 3.a–f : encaisser, annuler, émettre un reçu, lire chez un autre atelier → refusé, rien modifié | `integration/clients/clientService` (« cross-tenant ») ; côté serveur aussi `security_attacks_local.sql` |
| 4. Permission insuffisante | 4.a–e : EMPLOYEE (encaisser, annuler, reçu), APPRENTICE (commande, écriture directe) | `integration/team`, `integration/dashboard` |
| 5. Changement de prix | 5.a–c : prix figé à la création, un prix glissé dans une mise à jour est ignoré, prix négatif refusé | `integration/orders/orderService` (« changement de prix ») |
| 6. Annulation de paiement | 6.a–f : motif obligatoire, annulation unique, contre-avoir hors solde, montant immuable | `integration/orders/paymentService`, `receiptService` |
| 7. Génération de reçu | 7.a–e : `REC-AAAA-NNNNNN`, numérotation consécutive par atelier, reçu ni modifiable ni supprimable | `integration/orders/receiptService`, `unit/receipts/*` |

## Positionnement

- **Unitaires** : domaine pur (hormis accès `indexedDB`) — règles métier,
  validation, arithmétique exacte, transformations.
- **Intégration** : services applicatifs branchés sur les vrais repositories
  locaux (`fake-indexeddb/auto`), le `SyncEngine`, et le serveur de sync simulé
  (`tests/support/fakeSyncServer.ts` — idempotence, conflits, échecs).
- **E2E fil de l'eau** : un parcours métier complet traversant plusieurs
  domaines, puis flush vers le pseudo-serveur.

## Inventaire application (43 fichiers, 312 tests)

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
| `unit/security` | en-têtes HTTP (CSP…) |
| `integration/sync/planRefusals` | refus de plan (`PLAN_LIMIT`), relance |
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

## Inventaire serveur (`npm run test:db`, 157 vérifications)

| Scénario | Couvre |
|---|---|
| `critical` | les 7 cas critiques ci-dessus (autonome) |
| `invitations` | invitations d'équipe (0017) — crée l'atelier de test des suivants |
| `appointments` | rendez-vous et rappels (0019) |
| `files` | `register_file` / `delete_file`, limite de débit (0020/0021) |
| `security_attacks` | 31 attaques : écritures directes, usurpation, définisseurs (0021) |
| `subscriptions` | droits, limites, essai, RPC admin (0022) |

## État

- **312 tests application** (43 fichiers) + **157 vérifications serveur**,
  typecheck/eslint/build verts, CI GitHub Actions.
- Contre-exemples couverts : montants invalides, types inconnus, doublons de
  référence de reçu, déplacement négatif de stock, suppression interdite,
  changement de rôle auto, dernier OWNER, permissions manquantes.