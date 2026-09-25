# DATABASE.md — Schéma et conventions PostgreSQL (Prompts 09-10)

Date : 2026-09-24 — Contenu vérifié : les 9 migrations s'appliquent sur PostgreSQL 17 local (cluster jetable), 25 tables, RLS activée sur les 25, politiques RLS et isolation multi-tenant validées (22/22 scénarios), gardes financières testées.

## 1. Migrations versionnées (`supabase/migrations/`)

| Fichier | Contenu |
|---|---|
| `0000_platform_identity.sql` | extensions (pgcrypto, pg_trgm), `set_updated_at()`, tenants, roles, permissions, role_permissions, profiles, tenant_memberships, counters |
| `0001_customers_orders.sql` | customers, measurement_profiles, fabrics, orders, order_items, order_status_history, measurement_snapshots, alterations, stock_movements |
| `0002_finance.sql` | payments (+ garde annulation), receipts (+ garde immuabilité) |
| `0003_appointments_notifications.sql` | appointments, notifications |
| `0004_files_audit.sql` | files (références R2), audit_log |
| `0005_subscriptions.sql` | plans, subscriptions (+ seed FREE/BASIC/PRO) |
| `0006_sync.sql` | sync_operations |
| `0007_rbac.sql` | RBAC applicatif : `platform_members`, helpers de sécurité (`tenant_claim`, `my_tenant_ids`, `has_permission(_in)`, `is_saas_admin`, `session_profile_id`), trigger `tenant_memberships_rules`, `append_audit`, seed 32 permissions + rôles (OWNER/MANAGER/EMPLOYEE/APPRENTICE/SAAS_ADMIN) |
| `0008_rls_policies.sql` | politiques RLS sur les 26 tables (lecture par `tenant`/`my_tenant_ids`, écriture par permission fine) |

Règles : migrations séquentielles, jamais modifiées après application — on ajoute une migration. Un fichier = un lot cohérent.

## 2. Invariants appliqués

- **tenant_id** sur toutes les tables métier (sauf plateforme : tenants, roles, permissions, role_permissions, plans ; identité : profiles liée à `auth.users`).
- **Montants en `bigint`** (FCFA entiers), `check (>= 0)` ; jamais de float. `quantity` tissu en `numeric(10,2)` (non monétaire, autorisé).
- **Pas de suppression destructive** : `deleted_at` / statut `ARCHIVED` / `CANCELLED`. Tables immuables : `order_status_history`, `measurement_snapshots`, `stock_movements`, `receipts` (trigger `receipts_no_edit`), `audit_log`.
- **IDs** : PK `uuid` (`gen_random_uuid()`) ; références affichées en colonnes séparées : `orders.reference` (ORD-YYYY-XXXXXX), `receipts.reference` (REC-YYYY-XXXXXX), générées par compteur atomique par tenant/année (table `counters`).
- **`ON DELETE RESTRICT`** sur tout lien métier critique ; `SET NULL` sur les références optionnelles aux profils.
- **created_at/updated_at** partout ; triggers `set_updated_at()` sur les tables mutables ; timestamps immuables sur les tables d'historique.
- **RLS activée sur chaque table** dans la migration (`alter table ... enable row level security`). Politiques = prompt 10 (voir `docs/SECURITY.md`).

## 3. Tables (25)

Plateforme & identité : `tenants`, `roles`, `permissions`, `role_permissions`, `profiles`, `tenant_memberships`, `counters`.
Métier : `customers`, `measurement_profiles`, `measurement_snapshots`, `orders`, `order_items`, `order_status_history`, `alterations`, `fabrics`, `stock_movements`, `appointments`, `notifications`.
Finance : `payments`, `receipts`.
Fichiers & audit : `files`, `audit_log`.
SaaS : `plans`, `subscriptions`.
Offline : `sync_operations`.

## 4. Recherche et index

- Recherche clients : GIN `pg_trgm` sur `full_name` + `phone` (coalesce) → requêtes `ILIKE %x%` rapides.
- Recherche tissus : GIN `pg_trgm` sur `fabrics.name`.
- Composites clés : `(tenant_id, status)`, `(tenant_id, created_at, id)`, `(order_id, created_at)`, `(fabric_id, created_at)`, `(tenant_id, starts_at)`, `(recipient_profile_id, read_at)`.
- Unicité métier : `(tenant_id, lower(phone))` clients actifs ; `(tenant_id, name)` profils de mesures actifs ; `(tenant_id, reference)` commandes et reçus ; `(idempotency_key)` paiements et sync_operations.

## 5. Pagination

- Listes volumineuses : keyset `WHERE (created_at, id) > (:last_created_at, :last_id) ORDER BY created_at, id LIMIT n`.
- Petites listes : `OFFSET` acceptable.

## 6. Gardes côté base (déjà actives)

- `payments_cancellation_guard` : `CANCELLED` oblige `cancelled_at` + `cancellation_reason` non vide.
- `receipts_immutable` : reçu = aucune UPDATE ni DELETE (un correctif = contre-avoir `is_correction`).
- Contraintes `check` : montants ≥ 0 (paiements > 0), statuts fermés par liste blanche, `ends_at > starts_at` pour RDV.

## 7. Finance (rappel skill atelierflow-finance)

- `total_paid` = somme des paiements `VALID` de la commande.
- `remaining = total_price - total_paid` ; `remaining < 0` → `surplus = abs(remaining)`.
- Recalcul systématique serveur dans l'ordre chronologique ; jamais de solde stocké mutable comme source de vérité.
- Reçu = instantané `state` validé au moment de l'émission.

## 8. Validation effectuée

Cluster PostgreSQL 17 jetable local (port 54329, session jetable), base `atelierflow_test` :
1. `auth` stub (GoTrue absent en local) + rôle `authenticated` + grants posés après migrations ;
2. applications des 9 migrations → `OK` ;
3. smoke test Prompt 09 : injection flux complet (tenant, membre OWNER, client, commande, article, paiement, reçu, tissu, mouvement, RDV, fichier, audit, sync) ; gardes `paiement sans motif refusé`, `annulation propre`, `reçu immuable` → `OK` ;
4. validation RLS Prompt 10 : 22 scénarios d'isolation (lecture/écriture cross-tenant, permissions par rôle, auto-escalade auto-désactivation, dernier OWNER, invitation acceptée, SAAS_ADMIN vs données métier, anon bloque) → **22/22 PASS** ;
5. récapitulatif : 25 tables, 25 RLS activées.

À refaire sur le projet Supabase réel (phase 04) via le tooling Supabase (migrations + RLS réelles vs auth GoTrue, claim JWT `tenant_id`).

## 9. Points d'attention pour la suite

- Phase 10 livrée : détails RLS, permissions et modèle d'isolation → `docs/SECURITY.md`.
- Phase 11 livrée : `sync_operations` consommée par la queue locale ; moteur offline-first testé → `docs/SYNC.md`.
- Phase 15 : logique de solde/surplus en `src/domain/money` (unit-tests) branchée sur ces tables.
- Phase 11 : `sync_operations` consommée par la queue locale (idempotence par `idempotency_key`).
- Phase 16 : génération PDF reçus → `files.pdf_key` + `receipts.state`.
- Le nom « atelierflow » n'apparaît dans aucune donnée ; `tenants.settings` porte le branding configurable.