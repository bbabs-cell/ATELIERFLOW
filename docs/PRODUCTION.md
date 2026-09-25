# FINALISATION PRODUCTION (Prompt 26) — Plan de mise en production

État : **blueprint final**, prêt à exécuter lors du provisionnement réel
(phase 04 → infra, phase 05 → transports). Tout ce qui n'exige pas
d'accès externes est déjà livré et vérifié localement.

## 1. Bilan de l'état actuel (tout véridifié localement)

| Domaine | État |
|---|---|
| Application locale (14 routes) | 180 tests / typecheck / lint / build verts |
| Offline-first + sync | `SyncEngine` événementiel, idempotence `pushedCount=2 / appliedCount=1`, conflits (tests) |
| Finance | F CFA entiers, INSERT immuable, solde exact, reçus `REC-YYYY-XXXXXX`, `idempotency_key` |
| Multitenant / RLS | 26 tables isolées, 22 scénarios d'isolation PASS, `docs/SECURITY.md` |
| Audits | `SECURITY_AUDIT.md`, `RESPONSIVE_AUDIT.md`, `PERFORMANCE_AUDIT.md` (0 critique, 8 recommandations) |

## 2. Ordre de mise en production

### 2.1 Provisionnement (nécessite les accès — `.env.example` fourni)

1. **Supabase** : créer projet → `supabase db push` (migrations `0000_*`→`0008_*`)
   → configurer le **hook JWT** injectant le claim `tenant_id` (SECURITY §3) →
   vérifier l'absence de `tenant_id` = refus (T25-T26).
2. **Rejouer la validation d'isolation** : `rls_validation.sql` branché sur le
   projet réel (les 22 scénarios doivent passer tels quels).
3. **Hardening base (R2 de l'audit sécu)** : dans une migration de fermeture,
   poser les `REVOKE` explicites (anon → rien ; `authenticated` en accès
   granulaire), `alter default privileges`, et restreindre les écritures
   sensibles (`payments`, `receipts`, `counters`) à des fonctions serveur
   `security definer`.
4. **Cloudflare R2** : création des buckets privés (layout :
   `{tenant_id}/customers|orders|fabrics/{id}/…`, reçus PDF), vérification
   MIME/taille côté serveur, URLs signées courte durée (`R2_SIGNED_URL_TTL=600`).
5. **Vercel/GitHub** : repo + CI (typecheck/lint/test/build), variables
   d'environnement selon `.env.example`, domaine + HTTPS.

### 2.2 À aligner dans le code au moment du branchement (dettes tracées)

- **Navigation produit** : brancher `AppShell` (déjà mobile-first) sur les 8
  vues métier ; brand passé par prop (configurable, rien n'est figé sur
  « atelierflow »).
- **Shortcuts manifest** : pointer `/commandes/nouveau` et `/rendez-vous`
  vers les routes réelles (ou créer ces routes) — PERF R4.
- **Tenant réel** : remplacer les constantes démo
  (`CLIENTS_DEMO_TENANT_ID`, `ORDERS_DEMO_*`, …) par le tenant de session
  (`tenant_claim()`) ; les facades consomment déjà une injection `tenantId`,
  aucun changement de signature nécessaire.
- **Transport réel** : branch le `RemoteSyncPort` du `SyncEngine` sur Supabase
  (server=la gateway), le transport WhatsApp (rôle existant `notifications`),
  et l'émission PDF des reçus.
- **Sécurité HTTP (SEC R1)** : ajouter `headers()` (CSP, X-Content-Type-Options,
  X-Frame-Options, Referrer-Policy, HSTS) dans `next.config.ts`.
- **Meta/x retry** : relire les règles `queuePolicy` (backoff) pour les
  transporteurs externes.

### 2.3 Go-live

- Backup initiaux + rôles OWNER créés avant import des données.
- Test TA (acceptation) : parcours complet hors-ligne→en-ligne, reçus,
  annulations, changement de rôle/équipe, abonnement actif.
- Démarrage : migration `counters` séquencés, dashboard vivant, PWA installée
  (manifest unique).

## 3. Post-go-live (contrôles)

| Check | Cible |
|---|---|
| Rejouer les 22 scénarios d'isolation | Supabase réel |
| Budgets de perf | largest chunk ≤ ~71 Ko gz, FCP statique, scans R1 bornés |
| Audit finance | soldes exacts sur 100 commandes aléatoires, reçus/annulations cohérents |
| Mises à jour PWA | SW versionné, activation validée utilisateur |
| Monolog/erreurs | aucune exception `forbidden` hors sémantique |

## 4. Fermeture du roadmap

La boucle des 26 prompts est bouclée côté code (le présent plan = item 26).
Toute résolution non déléguable reste conditionnée à la fourniture des accès
phase 04/05 — aucun savoir n'est en suspens dans le code.

## 5. Phase 04 — avancement code offline (livré sans clés)

| Lot | Statut | Contenu |
|---|---|---|
| Hygiène repo | FAIT | `git init` + `.gitignore` (secrets `.env*` exclus) |
| Durcissement SQL | FAIT (à rejouer) | `supabase/migrations/0009_hardening.sql` : revokes anon, grants `authenticated` granulaires, défauts restrictifs (SEC R2/R3) |
| Env Supabase | FAIT | `src/infrastructure/supabase/env.ts` (browser/server, clé service jamais côté client) |
| Transport réel | FAIT | `chooseRemote.ts` (+stub explicite par défaut) + `syncRelay.ts` + passerelle `POST /api/sync` (`route.ts`) ; RPC `sync_push` surchargeable `NEXT_PUBLIC_SYNC_RPC` |
| Tests | FAIT | `tests/unit/sync/*` — 13 tests (validation lot, mapping, relais session, stub) |
| Relais serveur `sync_push` | FAIT (offline, à valider) | migration `0010_server_sync.sql` : RPC SECURITY DEFINER, claim-first `exactly-once` (subtransactions par op, re-ACK), appliquants par entité miroir RLS 0008, références ORD/REC par compteurs, double garde `payments.idempotency_key` — `docs/SERVER_SYNC.md` ; **validation requise sur base réelle** (rejeu 0000→0010, 22 scénarios RLS, concurrence, finance) |
| Clés/URL | EN ATTENTE | pour `supabase db push`, hook GoTrue `tenant_id`, rejeu 22 scénarios RLS, R2, CI/CD |

Fichiers de référence : `.env.example`, `docs/SECURITY.md`,
`docs/SECURITY_AUDIT.md`, `docs/RESPONSIVE_AUDIT.md`,
`docs/PERFORMANCE_AUDIT.md`, `docs/TESTS.md`, `docs/ROADMAP.md`.