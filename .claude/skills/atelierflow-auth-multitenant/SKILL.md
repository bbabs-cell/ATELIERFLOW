---
name: atelierflow-auth-multitenant
description: Use when implementing or modifying authentication, sessions, roles (OWNER, MANAGER, EMPLOYEE, APPRENTICE, SAAS_ADMIN), permissions, tenant membership, RBAC, RLS policies, or tenant isolation checks for the atelierflow SaaS. Trigger keywords: auth, login, session, RLS, policy, tenant, multi-tenant, role, permission, RBAC, isolation, SECURITY.md.
---

# atelierflow-auth-multitenant

Authentification + tenant isolation. La sécurité de séparation est non négociable.

## Principe central

**Le tenant courant est dérivé du contexte authentifié (JWT/claim/token Supabase), jamais d'un valeur client** (`tenant_id` dans le body/query N'EST PAS une source de vérité). Toute requête fonctionne dans le tenant de session, ou est rejetée.

## Modèle

- `tenants`, `profiles` (liés à auth.users), `tenant_memberships` (utilisateur ↔ tenant, `status: ACTIVE/INVITED/DEACTIVATED`), `roles` + `permissions` (+ jonction), et `tenant_membership_roles`.
- Rôles gérés en base : `OWNER`, `MANAGER`, `EMPLOYEE`, `APPRENTICE`. Rôle plateforme hors-tenant : `SAAS_ADMIN` (peut voir les tenants, jamais de données métier comme un membre).
- Permissions granulaires évaluées **côté serveur/RLS**, jamais seulement côté frontend.

## RLS obligatoire

- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` sur les tables métier.
- Politiques basées sur `auth.uid()`, joint à `tenant_memberships` pour résoudre le tenant, et sur le rôle pour résoudre le niveau d'accès.
- Toute nouvelle table métier : RLS activée dans la même migration.
- La logique applicative peut ajouter des `WHERE tenant_id = ...` défensifs, mais la RLS reste la barrière de base.

## Tests d'isolation à toujours repasser

1. tenant A ne lit pas les données de B ;
2. tenant A ne modifie pas les données de B ;
3. rôle insuffisant → refus (204/403) ;
4. tentative d'accès direct par ID étranger → refus ;
5. accès fichier cross-tenant → refus (cf. atelierflow-files) ;
6. opérations financières protégées (cf. atelierflow-finance).

## Vérifications

- Jamais de secret en frontend ; sessions à courte durée, refresh contrôlé.
- Invitation : lien/jeton temporaire, création de membership INVITED puis ACTIVE.