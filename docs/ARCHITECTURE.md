# ARCHITECTURE — Production (Prompt 07)

Date : 2026-09-24 — Valide pour la V1 Premium. Nom technique temporaire : `atelierflow` (remplaçable partout, jamais une dépendance métier ou de branding).

## 1. Stack cible

| Couche | Choix | Justification |
|---|---|---|
| App | Next.js (App Router) + React, TypeScript strict | rendu serveur par défaut, route handlers pour l'API, déploie sur Vercel |
| Données | Supabase (PostgreSQL 15+) | Postgres, Auth, RLS, migrations versionnées |
| Fichiers | Cloudflare R2 | bucket privé, URLs signées, pas de dépense sortie bande passante |
| PWA | Manifest + Service Worker custom + IndexedDB | offline-first réel, cache contrôlé |
| Sync | Sync queue locale → API idempotente | pas de doublons, reprise après coupure |
| Dépôt | GitHub (branches + protection), CI GitHub Actions | tests + typecheck + lint + build avant merge |
| Déploiement | Vercel (preview / staging / production) | branches dédiées |

## 2. Arborescence cible

```
atelierflow/                        # racine ; renommable (le nom ne fige rien)
├─ .env.example                     # template de variables, jamais de secrets
├─ package.json                     # single app + scripts (test / lint / typecheck / build)
├─ docs/
│  ├─ ROADMAP.md
│  ├─ ARCHITECTURE.md               # ce document
│  ├─ DATABASE.md                   # étape 09
│  └─ SECURITY.md                   # étapes 10 / 23
├─ supabase/
│  ├─ migrations/                   # SQL versionné, 1 fichier par étape (ex: 0000_init.sql)
│  └─ policies/                     # (optionnel) politiques RLS extraites et testables
├─ src/
│  ├─ app/                          # ROUTES Next.js uniquement (server components + route handlers)
│  │  ├─ (public)/                  # landing, login, invitation, réinitialisation mdp
│  │  ├─ (app)/                     # shell authentifié multi-tenant
│  │  │  ├─ dashboard/
│  │  │  ├─ clients/                # fiches + mesures
│  │  │  ├─ commandes/
│  │  │  ├─ atelier/                # kanban
│  │  │  ├─ finance/                # paiements, soldes, recus, surplus
│  │  │  ├─ rendez-vous/
│  │  │  ├─ stock/
│  │  │  ├─ equipe/                 # membres + permissions
│  │  │  └─ reglages/               # branding tenant, abonnement
│  │  └─ api/                       # route handlers : serveur → application → repository
│  │     ├─ auth/                   # (le plus souvent géré par Supabase SSR)
│  │     ├─ sync/                   # POST push queue idempotent
│  │     ├─ payments/               # payement, annulation (idempotent)
│  │     ├─ receipts/               # génération PDF + URL signée
│  │     └─ files/                  # upload à signer, download à signer
│  ├─ domain/                       # DOMAIN : pur, sans I/O ni framework
│  │  ├─ money/                     # bigint, solde, surplus, canonicité
│  │  ├─ order/                     # statuts, transitions valides
│  │  ├─ receipt/                   # numérotation REC-YYYY-XXXXXX
│  │  ├─ permission/                # règles RBAC (role → permissions)
│  │  ├─ sync/                      # statuts de queue, règles d'idempotence
│  │  └─ ids/                       # génération idempotency_key etc.
│  ├─ application/                  # APPLICATION : use-cases, orchestration, transactions
│  │  ├─ clients/
│  │  ├─ commandes/
│  │  ├─ finance/
│  │  ├─ stock/
│  │  ├─ rendezVous/
│  │  └─ sync/
│  ├─ repository/                   # REPOSITORY : ports (interfaces) + implémentation
│  │  ├─ ports/
│  │  ├─ supabase/                  # implémentation PostgreSQL/Supabase
│  │  └─ local/                     # implémentation IndexedDB (offline)
│  ├─ infrastructure/               # INFRASTRUCTURE : adaptateurs externes
│  │  ├─ supabase-client/           # SSR client, auth helpers
│  │  ├─ r2/                        # R2 private bucket, URLs signées, MIME check
│  │  ├─ whatsapp/                  # abstraction (génération de liens, future API)
│  │  ├─ pdf/                       # génération de reçus
│  │  └─ config/                    # schéma d'environment (zod), guard serveur/client
│  ├─ ui/                           # DESIGN SYSTEM : composants + tokens (étape 08)
│  │  ├─ tokens/                    # couleurs, typo, spacing, radius, shadows (CSS vars)
│  │  ├─ primitives/                # button, input, card, dialog, drawer, toast…
│  │  └─ composites/                # kanban, timeline, calendrier, table, badge…
│  ├─ features/                     # composition par domaine : UI + state + hooks métier
│  │  ├─ clients/
│  │  ├─ commandes/
│  │  ├─ finance/
│  │  └─ …
│  └─ lib/                          # utilitaires partagés non-métier (dates, formats)
├─ tests/
│  ├─ unit/                        # domain (money, statuts, RBAC, ids, cache PWA)
│  ├─ integration/                 # repository, RLS, sync idempotence
│  └─ e2e/                         # parcours critiques (offline, retrait, paiement)
└─ public/                         # assets statiques + service worker (public/sw.js) + pwa/
```

## 3. Couches et responsabilités (UI → Application → Domain → Repository → Infrastructure)

| Couche | Responsabilités | Interdit |
|---|---|---|
| `src/ui` + `src/app` | rendu, formulaires, états (loading/empty/error/success/offline/sync), navigation | toute math métier, tout accès DB direct |
| `src/features` | limites de domaine front : state local, hooks, orchestration UI↔application via API | écriture directe Supabase |
| `src/application` | use-cases, orchestration, transactions, vérifications d'autorisation **avant** écriture | accès aux détails R2/PDF/wa |
| `src/domain` | règles pures : money (bigint), solde, statuts, permissions, numérotation, idempotence | I/O, framework, HTTP |
| `src/repository` | accès données : ports + adapters (Supabase / IndexedDB) ; choix local↔remote par opération | règles métier |
| `src/infrastructure` | adaptateurs externes (Supabase auth, R2, PDF, WhatsApp, config) | règles métier, logique UI |

Règle de dépendance : `app/ui → features → application → repository/domain ← infrastructure`. `domain` ne dépend de rien. Le serveur est la seule couche qui parle à Supabase et R2.

## 4. Flux de données

- Lecture (online) : Server Component → `application.useCase` → `repository.supabase` → SQL + RLS → sérialisation (money en entier, dates ISO). Pagination keyset `(created_at, id)`, recherche `pg_trgm`.
- Écriture (online) : `app/api/*` → `application.useCase` → transaction → `audit_log` → réponse canonique (ex. solde recalculé).
- Écriture (offline) : écriture IndexedDB ACK immédiate → `sync_operations` (PENDING) → reconnexion → `app/api/sync` → application (idempotence par `idempotency_key`) → SYNCED / FAILED / CONFLICT.
- Lecture (offline) : IndexedDB cloisonnée par tenant, purge contrôlée à déconnexion si demandée.

## 5. Flux auth (détail dans Prompt 10)

1. Supabase Auth (email/mot de passe MVP), session JWT + refresh via `@supabase/ssr`.
2. Tenant et rôle résolus **côté serveur** uniquement : `auth.uid()` → `tenant_memberships` + `roles/permissions`. Jamais depuis le body/query client.
3. RLS : `ENABLE ROW LEVEL SECURITY` sur toutes les tables métier ; politiques par `auth.uid()` join `tenant_memberships`. Barrière de base.
4. Rôles : `OWNER`, `MANAGER`, `EMPLOYEE`, `APPRENTICE` (tenant) ; `SAAS_ADMIN` (plateforme, jamais de données métier comme un membre).
5. Middleware Next uniquement pour router la navigation ; le contrôle réel est dans RLS + use-cases.

## 6. Flux paiement (détail Prompt 15)

1. Client → `POST /api/payments` avec `{ orderId, amount(bigint), method, idempotency_key }`.
2. `application.finance` : RLS d'abord ; transaction : insert payment `VALID` → re-calcul du solde **en entier, dans l'ordre chronologique** des paiements validés → `total_paid`, `remaining`, `surplus` → `audit_log`.
3. Réponse canonique : `{ total, total_paid, remaining, surplus }`. Cette valeur est toujours recalculée, jamais stockée comme source de vérité mutable.
4. Annulation = nouvelle opération `CANCELLED` (+ `cancelled_at`, `cancelled_by`, `reason`) → re-calcul → audit. Jamais de DELETE.
5. Offline : paiements également mis en queue, mais conflit financier → `CONFLICT` + révision manuelle (jamais de last-write-wins automatique). Double push rejoué → rejet par idempotence (1 seul paiement).

## 7. Flux fichiers (détail Prompt 05)

1. Upload : client demande `POST /api/files/sign-upload` (auth + permission + target tenant) → serveur valide → retourne URL signée + clé serveur (`tenants/{tenantId}/{category}/{fileName}`).
2. Le serveur (ou un Worker R2) valide **magic bytes MIME** + taille (photos ≤ ~8 Mo jpeg/png/webp ; PDF ≤ ~5 Mo).
3. Download : `POST /api/files/sign-download` → vérifie autorisation (tenant + permission) → URL signée à court terme. Aucun accès public, aucune clé dans le frontend.
4. Refus cross-tenant : la clé contient `tenantId` → le serveur refuse toute clé hors tenant de session ; l'URL signée est liée à une clé vérifiée.
5. Cycle de vie : reçus immuables ; photos = soft-delete contrôlé ; pas d'auto-suppression.

## 8. Flux offline / sync (détail Prompt 11)

1. `sync_operations` : `idempotency_key` (uuid), `tenant_id`, `entity`, `entity_id`, `operation`, `payload`, `created_at`, `status`, `retry_count`, `last_error`.
2. Statuts : `PENDING → SYNCING → SYNCED` ; `FAILED` (visible) ; `CONFLICT` (à réviser).
3. Retry à backoff progressif, plafonné, puis `FAILED` avec message exploitable. Reprise planifiée sur événements en ligne.
4. Données locales cloisonnées par tenant en IndexedDB ; jamais de données privées en cache SW incontrôlé.

## 9. Conventions

- TypeScript `strict`, zéro `any`, zéro enum volatile : unions de constantes string typées.
- Serveur par défaut (RSC) ; `"use client"` au minimum nécessaire.
- **Money** : calculs en `bigint`, FCFA francs entiers ; stockage SQL `bigint` ; transport JSON en entier (borné < 2^53, guard de validation). Jamais de float.
- IDs : PK `uuid` (`gen_random_uuid()`) ; références affichées distinctes (`REC-YYYY-XXXXXX`, séquence par tenant+année).
- `snake_case` DB, singulier, clés `{table}_id` ; `ON DELETE RESTRICT` ; `created_at/updated_at` partout ; tables de mutation sensibles + `audit_log`.
- Soft-delete / `ARCHIVED` par défaut ; pas de DELETE destructeur sur données métier.
- `.env*` jamais commités ; `.env.example` source de vérité des noms de variables ; schéma zod de `env` au boot (server only).
- Erreurs : format API unique (`{ error: { code, message, details? } }`), jamais de stack interne exposé.
- Branding tenant : nom, logo, devise configurables. Le mot "atelierflow" n'apparaît ni dans l'UI finale ni dans les données.

## 10. Décisions techniques (ADR court)

| # | Décision | Justification / conséquence |
|---|---|---|
| 1 | Single Next.js app (pas de monorepo multi-apps en V1) | simplicité de deploy + tests ; les frontières de couche sont dans `src/*` |
| 2 | Supabase Auth SSR (`@supabase/ssr`) + RLS comme barrière de sécurité | isolation par design, pas par filtre front |
| 3 | Domain 100% pur et unit-testé ; les tests financiers du Prompt 15 y vivent | preuve d'exactitude indépendante du framework |
| 4 | Idempotence par `idempotency_key` sur toute écriture métier | garantie anti-doublon offline et multi-tab |
| 5 | Money en `bigint`, recalcul permanent du solde, jamais stocké mutable | exactitude auditable |
| 6 | Fichiers R2 privés + URLs signées court terme, MIME par magic bytes | sécurité et maîtrise des coûts |
| 7 | PWA : SW custom contrôlé, cache shell/assets uniquement | pas de données privées en cache |
| 8 | Design system par tokens CSS vars, branding configurable | étape 08 ; nom produit remplaçable |
| 9 | Pagination keyset partout où le volume l'exige | dashboard/recherche rapides (étape 20) |
| 10 | CI : typecheck + lint + tests unitaires/intégration avant merge | sécurité des étapes 22-26 |

## 11. Frontières d'infrastructure encore à provisionner (phases 04-06, **bloquantes pour Prompt 09+**)

- Supabase : projet + token d'accès (phase 04) — **non provisionné**.
- Cloudflare R2 : compte + bucket privé (phase 05) — **non provisionné** (0 bucket existant).
- GitHub : dépôt + protection de branche (phase 06) — **non provisionné** (pas de dépôt Git).
- Vercel : projets/staging/prod + variables par environnement (phase 06) — **non provisionné**.
- Variables d'environnement locales : **aucune** dans l'environnement courant.

L'architecture ci-dessus est conçue **avant** ces provisionnements : l'étape 09 (migrations) et l'étape 10 (RLS) nécessiteront le projet Supabase ; l'étape 05/étape 13+ nécessiteront R2. Ces provisionnements doivent être confirmés avant d'exécuter Prompt 09.

## 12. Risques et mitigations

- Risque : commencer le code avant les provisionnements d'infra → impact : workarounds à jeter. Mitigation : ordre 08 (design system, sans serveur) puis provisionnements 04-06, puis 09.
- Risque : isolation tenant défaillante → tests d'isolation imposés (Prompt 10) + RLS comme barrière, jamais frontend.
- Risque : exactitude financière → math pure en `bigint`, scénarios tests du Prompt 15.
- Risque : "atelierflow" figé dans le code → interdiction transcrite en conventions + audit Prompt 26.

---

### État de la phase 07

Architecture de production définie. Convient comme base pour :
- Prompt 08 (design system) — sans dépendance serveur.
- Prompt 09 (database) — nécessite Supabase provisionné (phase 04).
- Prompt 10 (auth/RLS) — nécessite Supabase provisionné.

Termine par : **ARCHITECTURE READY** (le développement fonctionnel démarre à l'étape suivante).