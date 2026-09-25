# AUDIT SÉCURITÉ (Prompt 23) — Rapport factuel

Audit par inspection de code et de migrations, le 2026-09-25. Aucun
changement de code pendant cet audit (constat + recommandations).

## Bilan court

16 points audités : **13 PASS** (preuve dans le code), **4 recommandations**,
**0 vulnérabilité critique** dans l'existant. La barrière d'isolation repose
sur RLS + helper JWT, cohérente avec `docs/SECURITY.md`.

---

## PASS (vérifiés dans le code)

| # | Contrôle | Preuve |
|---|---|---|
| P1 | Aucun secret frontend | `grep password/secret/api_key/token/PRIVATE KEY` sur `src/` → 0 (seul hit : route `"/reset-password"` du cache policy). Aucun `.env*` dans le dépôt. |
| P2 | Aucun sink XSS | `dangerouslySetInnerHTML`, `eval(`, `new Function`, `document.write` → 0 dans `src/`. React échappe par défaut. |
| P3 | Aucun appel réseau codé en dur | `fetch(`, `XMLHttpRequest`, `WebSocket`, URL `http(s)://` → 0 dans `src/` : le transport passe par l'adapter injecté dans le `SyncEngine`. |
| P4 | Pas de `localStorage`/`sessionStorage` | 0 usage dans `src/` (aucun jeton stocké côté app). |
| P5 | Stockage indexé par tenant | `src/repository/local/indexeddb/db.ts` : `dbNameFor = "${DB_PREFIX}:${tenantId}:${version}"` — cache ET queue sont isolés par tenant. |
| P6 | RLS activée partout | 26 `ENABLE ROW LEVEL SECURITY` (0000→0007 : 7+9+2+2+2+2+1+1) et 26 tables couvertes par des `create policy` dans `0008_rls_policies.sql`. |
| P7 | Tenant jamais pris du client | `tenant_claim()` lit `auth.jwt() ->> 'tenant_id'`, null-safe (`0007_rbac.sql:39-44`) ; `my_tenant_ids()` = membres ACTIVE (`0007:47-56`). |
| P8 | Permissions RLS par domaine | ex. `customers_insert` = `tenant_claim() and has_permission('customers.write')` (`0008:127-130`) ; `payments_update_cancel` force `status='CANCELLED'` + `payments.cancel` (`0008:278-285`) ; `receipts_insert` exige `receipts.issue` (`0008:292-295`). |
| P9 | Gardes de trigger défensives | `tenant_memberships_rules` (`0007:128-176`) : auto-changement de rôle, auto-désactivation, dernier OWNER actif intouchable. |
| P10 | `security definer` borné | Toutes les fonctions `security definer` posent `set search_path = public` (`0007:52,65,81,100,110,132,194`). |
| P11 | SAAS_ADMIN isolé | `platform_members` lisible uniquement par `is_saas_admin()` (`0008:371-372`) ; jamais combiné aux tables métier. |
| P12 | Audit en écriture seule serveur | `audit_log` sans politique INSERT ; écriture via `append_audit()` `security definer` qui re-vérifie l'appartenance (`0008:352`, `0007:183-204`). |
| P13 | PWA ne cache pas le sensible | `src/domain/pwa/cachePolicy.ts:27-33` : `/api/ /auth/ /sync /invitation /reset-password` → `network-only`. |

## Recommandations (sévérité basse — à faire en phase 04/05)

**R1 — Headers de sécurité HTTP (basse)** : `next.config.ts` ne définit aucun
header. Ajouter via `headers()` de Next (précomptage) avant déploiement réel :
`Content-Security-Policy` (self + `connect-src` Supabase/R2), `X-Content-Type-Options:
nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, et HSTS
(`Strict-Transport-Security`) en HTTPS. Impact limité aujourd'hui (prérendu
statique, pas d'authentification en ligne).

**R2 — GRANT/REVOKE explicites (basse, défense en profondeur)** : les
migrations ne posent aucun `grant`/`revoke`. On repose à 100 % sur la RLS.
Avant la prod : `revoke all on all tables in schema public from anon`,
`authenticated` en accès granulaire, `alter default privileges`, et forcer
les rôles `postgres`/plateforme pour les écritures serveur (payments.cancel,
receipts.issue, etc. via fonctions).

**R3 — Compteurs sans permission (observation)** : `counters_select/insert/update`
(`0008:108-116`) exigent seulement d'être membre ACTIVE du tenant. Acceptable
(isolé par tenant) mais un membre peut brûler les séquences ORD/REC de son
tenant. Option : allocation limitée à une fonction `security definer` côté
serveur.

**R4 — Tenants « démo » codés en dur (note de déploiement)** : les facades
front injectent des tenants d'exemple (`CLIENTS_DEMO_TENANT_ID`,
`ORDERS_DEMO_*`, …). En phase 04, le tenant doit venir de la session
(`tenant_claim()`), jamais d'une constante. La couche base ne fait aucunement
confiance au tenant client (P7), donc aucune fissure d'isolation.

## Commentaire plans tarifaires

`plans_select_authenticated` (`0008:362-363`) = tout utilisateur authentifié
lit le catalogue — intentionnel (liste tarifaire publique), sans donnée
métier.

## Rappel des épreuves du skill

Les 6 épreuves (lecture cross-tenant, écriture cross-tenant, rôle
insuffisant, accès direct par ID étranger, fichier cross-tenant, finance
protégée) restent couvertes par les 22 scénarios de `docs/SECURITY.md` — à
rejouer en réel au provisionnement.