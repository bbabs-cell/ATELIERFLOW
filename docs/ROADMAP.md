# ATELIERFLOW — INDEX DES PROMPTS ET PLAN DE CONSTRUCTION

Version: V1 Premium
Nom technique temporaire: atelierflow

## ORDRE D'UTILISATION OBLIGATOIRE

1. `01_BOOTSTRAP_AUDIT` — bootstrap et audit initial
2. `02_SKILLS` — installation et vérification des skills
3. `03_MCP_ET_INTEGRATIONS` — MCP et intégrations
4. `04_SUPABASE` — préparation Supabase
5. `05_CLOUDFLARE_R2` — préparation Cloudflare R2
6. `06_GITHUB_VERCEL_ENV` — GitHub, Vercel, environnements
7. `07_ARCHITECTURE` — architecture de production
8. `08_DESIGN_SYSTEM` — design system premium
9. `09_DATABASE` — schéma PostgreSQL versionné
10. `10_AUTH_RLS_MULTITENANT` — auth, RLS, multi-tenancy
11. `11_OFFLINE_SYNC` — offline-first et synchronisation
12. `12_PWA` — PWA fiable
13. `13_CLIENTS_MESURES` — clients et mesures
14. `14_COMMANDES` — commandes et atelier
15. `15_PAIEMENTS_FINANCE` — paiements et intégrité financière
16. `16_RECUS` — reçus
17. `17_RENDEZ_VOUS_WHATSAPP` — rendez-vous et WhatsApp
18. `18_STOCK` — tissus et stock
19. `19_EQUIPE_PERMISSIONS` — équipe et permissions
20. `20_DASHBOARD_RECHERCHE` — dashboard et recherche
21. `21_ABONNEMENTS_SAAS` — abonnements SaaS
22. `22_TESTS` — tests complets
23. `23_SECURITY_AUDIT` — audit sécurité
24. `24_RESPONSIVE_AUDIT` — audit responsive
25. `25_PERFORMANCE_AUDIT` — audit performance
26. `26_FINALISATION_PRODUCTION` — finalisation V1 premium

## Statut des phases

| Prompt | Étape | Statut | Artefact |
|---|---|---|---|
| 01 | Bootstrap audit | EN ATTENTE DEV | — |
| 02 | Skills | FAIT | `docs/skills.md` + `.opencode/skills/*` |
| 03 | MCP et intégrations | FAIT (config) | `.opencode/opencode.json` |
| 04 | Supabase | FAIT (code offline, provision EN ATTENTE) | repo git + `.gitignore` ; migration `0009_hardening.sql` (grants/revokes position défense) ; `src/infrastructure/supabase/env.ts` ; branchement transport réel conditionnel `chooseRemote.ts` (stub `REMOTE_SYNC_NOT_PROVISIONED` par défaut, `createHttpRemoteSync` si env renseigné) ; passerelle `POST /api/sync` (`route.ts` + `syncRelay.ts` : validation du lot, relais de la session via le RPC `sync_push`) ; **relais serveur `0010_server_sync.sql`** (RPC `sync_push` SECURITY DEFINER, claim-first exactement-une-application, appliquants par entité, références ORD/REC par compteurs, re-ACK idempotent — `docs/SERVER_SYNC.md`) ; 13 tests sync/relay. Ajouts : `0011` hook GoTrue (claim `tenant_id`) + onboarding `create_owner_tenant` ; `0012` hook réservé à GoTrue/service ; `0013` UPDATE `tenants` ; `0014` correctif `to_jsonb` des appliquants sync ; **`0015` UPDATE `tenants` restreint à `name`/`currency`/`settings` (0013 laissait un OWNER réécrire `status`/`slug`) + slug d'onboarding sûr en concurrence**. Rejeux `supabase/validations/*` : 23/23 RLS + 27/27 sync PASS sur PostgreSQL 16 local (0000→0015). 0015 appliquée sur la base réelle le 2026-09-25 (vérifié : UPDATE limité à currency,name,settings). **`0016`** : RPC SECURITY DEFINER internes (`sync_apply*`, `next_reference_sequence`, trigger memberships) fermées à anon/authenticated, helpers RLS fermés à anon — appliquée sur la base réelle le 2026-09-25 (anon : 0 fonction, authenticated : 8 prévues). Données de test supprimées de la base réelle (`supabase/validations/2026-09-25_cleanup.sql`) : base vide hors catalogue (5 rôles, 32 permissions, 3 plans). Reste : activer le hook dans le dashboard (Auth → Hooks), `search_path` des 8 fonctions signalées par l'advisor, `pg_trgm` hors de `public`. |
| 05 | Cloudflare R2 | EN ATTENTE DEV | — |
| 06 | GitHub / Vercel / env | EN ATTENTE DEV | — |
| 07 | Architecture | FAIT | `docs/ARCHITECTURE.md` |
| 08 | Design system | FAIT | app Next.js + `src/ui/*` + `src/app/page.tsx` |
| 09 | Database | FAIT (local) | `supabase/migrations/0000-0008` + `docs/DATABASE.md` |
| 10 | Auth / RLS / multitenant | FAIT (code) — hook à activer | `supabase/migrations/0007-0008`, `0011`, `0015-0016` + `docs/SECURITY.md` §8 : `/connexion` (connexion, inscription), `/bienvenue` (création d'atelier via `create_owner_tenant`), `AuthGate` : tenant issu du claim JWT `tenant_id`, facades scopées par session (identifiants de démo supprimés), jeton transmis à `/api/sync`, reprise hors ligne, mode DEMO explicite sans Supabase. Rejeux réels 23/23 RLS + 27/27 sync. Reste : activer le hook dans le dashboard, invitation d'équipe par lien → étape 19. |
| 11 | Offline sync | FAIT (local) | `src/domain/sync` + `src/application/sync/engine.ts` + `src/repository/local/indexeddb` + `docs/SYNC.md` (19/19 tests) |
| 12 | PWA | FAIT (local) | `public/sw.js` + `public/pwa/manifest.webmanifest` + `src/features/pwa/*` + `docs/PWA.md` |
| 13 | Clients / mesures | FAIT (local) | `src/domain/clients` + `src/application/clients` + `/clients` + `docs/CLIENTS.md` (57 tests) |
| 14 | Commandes | FAIT — Kanban atelier | `src/domain/orders` + `src/application/orders` + `/commandes` + `docs/ORDERS.md` ; **Kanban atelier** (`OrderBoard`, logique `domain/orders/board.ts`) : une colonne par étape, glisser-déposer validé par les transitions du domaine, bouton « étape suivante » tactile, retards (« n j de retard », aujourd'hui, bientôt), tri retard → priorité → échéance, filtres priorité / personne / retards communs Liste et Atelier, **affectation** (`assign`, sélecteur dans le détail) ; `0018_orders_assignment.sql` (retrait d’affectation, membre ACTIVE vérifié) — appliquée en production le 2026-10-02. |
| 15 | Paiements / finance | FAIT (local) | `src/domain/orders/payments.ts` + `src/application/orders/paymentService.ts` + `PaymentsPanel` + `docs/FINANCE.md` (94 tests) |
| 16 | Reçus | FAIT | Émission immuable `REC-YYYY-XXXXXX` (référence et état recalculés par `sync_apply_receipts`) ; **document unique** `src/domain/orders/receiptDocument.ts` (atelier, client, commande, articles, paiement, mode, total, payé, reste/surplus, date, référence, montant en toutes lettres) partagé par l'aperçu, l'impression A5 et le PDF (`src/infrastructure/receipts/receiptPdf.ts`, pdf-lib, généré dans le navigateur, hors ligne) ; consultation `ReceiptViewer` (ouvert dès l'émission ou via « Voir »), téléchargement, impression, partage du PDF (Web Share) et message WhatsApp au client ; référence marquée provisoire tant que le serveur ne l'a pas confirmée ; coordonnées de l'atelier (`tenants.settings.receipt`) modifiables par le propriétaire. 266 tests. Reste : archivage du PDF dans R2 (`pdf_key`, étape 05). |
| 17 | Rendez-vous / WhatsApp | FAIT — `0019` appliquée en production le 2026-10-02 | Calendrier, création, **modification** (client, commande liée du même client, type, horaire, note), statuts ; **rappels** : panneau « Rappels à envoyer » (aujourd'hui/demain, sans rappel), `appointments.reminder_sent_at` partagé par l'équipe et remis à zéro si l'horaire change ; **WhatsApp click-to-chat** : message généré (rappel, confirmation, changement d'horaire, annulation, accords en genre/nombre), modifiable, numéro complété avec l'indicatif de l'atelier, ouverture de WhatsApp ; abstraction `WhatsAppGateway` prête pour l'API Business (non implémentée). Correctif : les rappels n'étaient plus créés comme notifications refusées par le serveur. `0019` : `reminder_sent_at`, UPDATE à clés présentes (délier une commande, effacer la fin), client/commande vérifiés dans l'atelier, transitions et rendez-vous clos verrouillés — `supabase/validations/appointments_local.sql` 8/8, rejeux 27/27 sync, 23/23 RLS, 20/20 invitations sur base vierge 0000→0019. 277 tests. |
| 18 | Stock | FAIT (local) | `src/domain/inventory/*` + `src/application/stock/stockService.ts` + `/stock` + `docs/STOCK.md` (137 tests) |
| 19 | Équipe / permissions | FAIT — 0017 appliquée en production le 2026-10-02 | `0017_team_invitations.sql` (invitations par lien à usage unique, jeton haché, 7 jours ; équipe et rôles côté serveur) + `/equipe` connecté (`RemoteTeamView`) + `/invitation/<jeton>` + partage WhatsApp / e-mail ; `docs/SECURITY.md` §9 ; 20/20 scénarios locaux. Mode démo : écran local d'origine. |
| 20 | Dashboard / recherche | FAIT (local) | `src/domain/dashboard/*` + `src/application/dashboard/dashboardService.ts` + `/dashboard` + `docs/DASHBOARD.md` (160 tests) |
| 21 | Abonnements SaaS | FAIT (local) | `src/domain/subscriptions/*` + `src/application/subscriptions/subscriptionService.ts` + `/abonnement` + `docs/SUBSCRIPTIONS.md` (171 tests) |
| 22 | Tests | FAIT | `tests/*` : recherche (unit) + E2E fil de l'eau + `docs/TESTS.md` (180 tests) |
| 23 | Audit sécurité | FAIT | `docs/SECURITY_AUDIT.md` : 16 points, 13 PASS, 4 recommandations (headers HTTP, grants, compteurs, tenants démo) |
| 24 | Audit responsive | FAIT | `docs/RESPONSIVE_AUDIT.md` : 12 points, 11 PASS, 3 recommandations (contraste ink-faint, tailles compactes, navigation produit AppShell) |
| 25 | Audit performance | FAIT | `docs/PERFORMANCE_AUDIT.md` : statique 100 %, ~977 Ko JS total (~71 Ko gz/chunk max), sync événementielle, 4 recommandations |
| 26 | Finalisation production | FAIT (blueprint) | `docs/PRODUCTION.md` + `.env.example` : ordre de provisionnement, dettes tracées (AppShell, shortcut manifest, tenants réels, headers, revokes), go-live |

## Règles générales

- Ne jamais coder une étape suivante si l'étape précédente est bloquée.
- Inspecter l'état réel du projet avant toute modification.
- Ne pas détruire de données.
- Ne jamais exposer de secrets.
- Pas de fake backend pour les fonctionnalités finales.
- Toutes les données métier doivent être multi-tenant.
- Les opérations financières doivent être exactes et auditées.
- Le mode offline et la synchronisation doivent éviter les doublons.
- Le nom « atelierflow » est temporaire et ne doit pas devenir une dépendance métier.
- L'interface doit être premium, simple et parfaitement responsive.
- Toute action destructive ou production critique exige une confirmation explicite.

---

*Document source : `docs/prompts/` (cahier des charges complet, prompts 00 à 26).*