# SECURITY.md — Modèle de menace, Auth, RLS et multi-tenancy (Prompt 10)

Date : 2026-09-24 — Validation locale : 22/22 scénarios d'isolation PASS (PostgreSQL 17, cluster jetable).
À repousser à l'identique sur le projet Supabase réel (auth GoTrue) dès le provisionnement (phase 04).

## 1. Postulats

- Le **tenant n'est jamais une valeur client** : il est dérivé exclusivement du JWT (claim `tenant_id`) posé par GoTrue dans `request.jwt.claims`.
- Chaque utilisateur = membre d'un ou plusieurs tenants **actifs** ; l'appartenance est vérifiée côté base (`my_tenant_ids()`) et non application.
- `SAAS_ADMIN` est un rôle **plateforme** (hors tenant) : voit la structure, jamais les données métier.
- RLS activée sur **toutes** les tables ; `authenticated` n'a aucun accès direct au-delà de ce que les policies autorisent.
- GoTrue (flèche auth) reste source de vérité des comptes ; `public.profiles` (profil métier) est créé par l'app et se lie à `auth.users` par `id`.

## 2. Helpers et fonctions de sécurité (migration `0007_rbac.sql`)

| Fonction | Rôle | Remarque |
|---|---|---|
| `tenant_claim()` | lit le claim JWT `tenant_id` | aucun argument → valeur déjà sûre |
| `my_tenant_ids()` | `uuid[]` des tenants où l'utilisateur est membre ACTIVE | retour `array` (les SRF sont interdites dans les policies) |
| `is_tenant_member(tenant_id)` | appartient au tenant (ACTIVE) | |
| `has_permission_in(tenant_id, code)` | permission valide sur ce tenant | jointure membres ACTIVE + rôle |
| `has_permission(code)` | raccourci `tenant_claim()` + `has_permission_in` | |
| `is_saas_admin()` | vrai pour un membre de `platform_members` | sortie plat passerelle : jamais `is_saas_admin() and ...` sur les données métier |
| `session_profile_id()` | wrapper défini `security definer` autour de `auth.uid()` | à utiliser dans les policies au lieu d'appeler `auth.uid()` seul |

Patterns imposés dans les policies :
- **toujours borné par le contexte** : `tenant_id = any(my_tenant_ids())` ou `= tenant_claim()`, jamais le `row_security` seul.
- `security definer` uniquement pour les fonctions systèmes (append_audit, wrappers auth) avec `set search_path`.
- pas de récursion : les helpers lisent `tenant_memberships`/`profiles` via leurs policies officielles (sauts de confiance cochés).

## 3. JWT et claims requis côté GoTrue

Au provisionnement Supabase, le JWT doit porter au minimum :
- `sub` → uid de `auth.users` (standard) ;
- `tenant_id` (claim personnalisé, UUID) → posé par l'application après connexion/multi-tenant.

Sans `tenant_id` : pas d'accès métier (tout `tenant_claim()` est NULL → policies `any`/`= NULL` refusent).
Alert : `anon` (pas de session) = aucun accès (testé T25-T26).

## 4. Stratégie RLS par table (migration `0008_rls_policies.sql`)

Toutes les tables ont `enable row level security` ; le schéma général une fois par domaine (noms réels dans les migrations) :

- **Lecture** : `tenant_id = any(my_tenant_ids())` (+ permission de lecture du domaine quand le rôle l'exige).
  Exception volontaire : un membre voit **sa propre** ligne de `tenant_memberships`, même si elle est INVITED (nécessaire pour accepter son invitation — et exigé par Postgres, qui filtre l'UPDATE par la politique de SELECT posée sur la même table).
- **Écriture / suppression** : permission fine du domaine (`customers.write`, `orders.write`, `payments.cancel`, `team.manage`, ...) + même contrainte de tenant.
- **Plateforme** : accès réservé `is_saas_admin()` (`tenants`, `roles`, `permissions`, `role_permissions`, `plans` partiellement).

### Ordre d'évaluation à connaître
Postgres applique sur une UPDATE aussi **la politique SELECT de la table** (filtre de scan) : un row invisible en SELECT ne peut pas être updaté. Conséquence : toute rule « lecture → écrire » doit laisser voir le row cible.

## 5. Gardes trigger (migration `0007_rbac.sql`)

`tenant_memberships_rules` (BEFORE INSERT/UPDATE) :
- auto-changement de rôle = bloqué (`new.profile_id = auth.uid()` et rôle modifié) ;
- auto-désactivation = bloquée (ACTIVE → INACTIVE sur soi-même) ;
- transition personnelle autorisée : uniquement `INVITED → ACTIVE` (acceptation d'invitation) ;
- dernier OWNER actif du tenant = intouchable (ni désactivation ni rétrogradation si update venant d'un OWNER) ;
- `joined_at` imposé lors du passage à ACTIVE.

## 6. Validation d'isolation (locale)

Scénarios automatisés (22 PASS / 0 FAIL) couvrant les 6 épreuves du skill : lecture cross-tenant refusée ; écriture cross-tenant refusée ; permission insuffisante refusée (write/cancel/encaissement) ; accès direct par ID étranger refusé (customers, tenants, files) ; isolation SAAS_ADMIN (voit tenants, aucune donnée métier) ; anon bloqué partout.

Harness local (cluster jetable) : `auth schema` + `auth.users` + `auth.jwt()/auth.uid()` lisant `request.jwt.claims` ; rôle `authenticated` nologin ; grants posés après migrations.

## 7. Déploiement réel (à faire en phase 04)

- appliquer les migrations via le CLI Supabase (0000-0008) ;
- configurer le hook JWT custom (claim `tenant_id`) à la connexion ;
- supprimer les blocs d'inférence intermédiaires si GoTrue ne connaît pas encore le claim (`tenant_memberships` reste la source) ;
- rejouer les 22 scénarios de `rls_validation.sql` connecté en réel.