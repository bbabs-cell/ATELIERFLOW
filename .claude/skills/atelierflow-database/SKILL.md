---
name: atelierflow-database
description: Use when designing, modifying, or querying the PostgreSQL/Supabase schema of the atelierflow sewing-workshop SaaS: tables, columns, tenants, migrations, RLS policies, indexes, search, money columns, timestamps. Trigger keywords: migration, table, schema, tenant_id, RLS policy, model data, DATABASE.md, pg_trgm.
---

# atelierflow-database

Conventions obligatoires pour tout schéma PostgreSQL (Supabase) du projet atelierflow.

## Règles non négociables

- **tenant_id sur toutes les tables métier** : customers, orders, payments, receipts, appointments, fabrics, stock, subscriptions, notifications, files, sync_operations. Sauf tables de plateforme (tenant, plan, role, permission, migration) et tables d'identité (auth.users).
- **Le tenant est dérivé du contexte authentifié**, jamais d'un input client non vérifié (cf. atelierflow-auth-multitenant).
- **Montants financiers : jamais de float/double.** Stocker en `bigint`, unité = plus petite unité monétaire réelle (FCFA : francs entiers). Toutes les mathématiques financières en entier. Un centime n'est jamais perdu.
- **Pas de suppression physique destructive par défaut.** Suppression logique : colonne `deleted_at` ou statut `ARCHIVED`. Sauf tables de queue/audit jetables, explicitement documentées.
- **Chaque table de mutation** : `created_at` (timestamptz, default now()), `updated_at` (déclencheur ou app). Les mutations sensibles sont en plus tracées dans `audit_log`.
- **IDs techniques indépendants des références affichées** : PK = `uuid` (gen_random_uuid()); les références humaines (FORMAT type "REC-2026-000123", "ORD-...") sont des colonnes séparées avec séquence/format.
- **Migrations versionnées** dans `supabase/migrations/`, numérotées séquentiellement (maison), un seul push/rollback cohérent, jamais modifiées après coup — on ajoute une nouvelle migration.

## Conventions

- Nommage : `snake_case`, noms singuliers (`customer`, `order_item`), foreign keys `{table}_id`.
- `ON DELETE RESTRICT` pour tout lien métier (interdire les cascades silencieuses sur données financières/commandes).
- Index : recherche texte partielle clients (name, phone) via `pg_trgm` (GIN + gin_trgm_ops); index composites sur `(tenant_id, statut)`, `(tenant_id, created_at)`, `(order_id, created_at)`.
- Pagination : `keyset` (cursor `(created_at, id)`) pour les listes volumineuses, `OFFSET` seulement pour les petits jeux.
- RLS : activer sur **toutes** les tables métier; politiques par `auth.uid()` joint à `tenant_membership` (cf. skill auth-multitenant).

## Rappel multi-tenant ècrit

En plus des `WHERE tenant_id = ...` adicionnels de l'application, la RLS reste la barrière de sécurité de base — jamais un simple filtre frontend.

## Le nom "atelierflow"

Jamais dans les données métier, le branding, ni les URLs. Tout libellé visible vient d'une config (tenant et/ou plateforme).