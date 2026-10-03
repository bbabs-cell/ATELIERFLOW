# Audit sécurité (étape 23)

Date : 2026-10-03. Périmètre : base Supabase de production (lecture seule),
code de l'application, routes API, stockage R2, variables Vercel,
dépendances. Les attaques sont **rejouées** sur une base PostgreSQL locale
construite avec les mêmes migrations (0000 → 0021) et les mêmes droits
que la production. L'audit du 2026-09-25 (fait avant la mise en
production) est remplacé par celui-ci.

## Verdict

**Pas de BLOCK RELEASE.** Aucune faille ne permet de lire ou de modifier
les données d'un autre atelier : les 14 attaques directes entre ateliers
échouent, avant comme après les correctifs, et un faux jeton visant
l'atelier réel ne voit aucune ligne en production (8 tables, 0 ligne).

Six défauts ont été trouvés : un d'**élevé**, deux **moyens** et trois
**bas**. Tous sont corrigés ici. La faille élevée (S1) peut être
exploitée en production tant que la migration `0021` n'y est pas
appliquée : il faut l'appliquer **avant d'ouvrir l'inscription à d'autres
ateliers**.

## Constats et correctifs

| # | Gravité | Constat | Preuve (avant) | Correctif |
|---|---|---|---|---|
| S1 | **Élevée** | Le propriétaire d'un atelier pouvait, par l'API REST, inscrire **n'importe quel compte** (UUID connu) dans son atelier, ACTIVE et OWNER. Le hook d'accès choisit en premier un atelier où l'on est OWNER : à sa session suivante, la victime (employée ailleurs) basculait dans l'atelier de l'attaquant et y saisissait ses clients. | scénarios 15-16 : `OK:1`, le hook renvoie l'atelier de l'intrus | `0021` : plus d'INSERT/UPDATE direct sur `tenant_memberships` ; les adhésions passent uniquement par `create_owner_tenant`, `accept_invitation` (jeton + e-mail exact), `set_member_role` / `set_member_status` |
| S2 | Moyenne | Écritures directes (REST) sur les tables métier, qui contournaient les contrôles de `sync_push` : une commande pouvait pointer vers le **client d'un autre atelier** (la clé étrangère ne vérifie pas l'atelier), l'historique de statut pouvait être forgé, les références étaient libres. | scénarios 17, 19 : `OK:1` | `0021` : INSERT/UPDATE/DELETE retirés à `authenticated` sur les 13 tables métier ; toute écriture passe par `sync_push` (atelier, permission, transitions, références serveur) |
| S3 | Moyenne | `append_audit` était appelable par tout membre, même APPRENTICE : fausses entrées au journal d'audit (par exemple « paiement annulé »). | scénario 22 : `OK:1` | `0021` : EXECUTE retiré ; seules les fonctions serveur écrivent le journal |
| S4 | Basse | Fonctions internes exécutables par `anon` (`tenant_claim`, aides `sync_*`, fonctions de déclencheur) ; `search_path` non fixé sur 8 fonctions (alerte Supabase 0011). | scénario 30 : `OK:1` ; advisor | `0021` : EXECUTE retiré, `search_path = public` |
| S5 | Basse | Privilèges par défaut : toute **nouvelle** table du schéma `public` était ouverte en écriture à `authenticated`. | `pg_default_acl` | `0021` : nouvelles tables en lecture seule par défaut, nouvelles fonctions fermées à `anon` |
| S6 | Basse | Aucun plafond d'envoi de fichiers : envoyer puis supprimer des photos en boucle remplissait R2 (la suppression est logique). | — | `0021` : 200 fichiers par heure et par atelier → `RATE_LIMITED:files` (HTTP 429), l'objet est retiré de R2 |
| H1 | Basse | Aucun en-tête de sécurité HTTP. Le jeton de session vit dans le stockage du navigateur : une injection de script le volerait. | `curl -I` | `next.config.ts` + `src/infrastructure/http/securityHeaders.ts` : CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP, suppression de `X-Powered-By` |

Banc : `supabase/validations/security_attacks_local.sql`, joué dans une
transaction annulée. Sur la base locale 0000 → 0020 : **19/31**. Sur la base
0000 → 0021 : **31/31**. Les validations existantes restent vertes après
`0021` : invitations 20/20, rendez-vous 8/8, fichiers 15/15, 304 tests
unitaires. Le parcours complet a été rejoué dans Chromium, avec CSP et
`0021` : client → commande → encaissement → reçu → archive PDF dans R2.
Résultat : 0 violation CSP, 0 opération refusée.

## Contrôles passés

| Domaine | Résultat |
|---|---|
| **Secrets** | Aucun secret dans le dépôt ni dans l'historique git (recherche de clés JWT, AWS/R2, clés privées, `service_role`) ; `.env*` ignorés. Vercel : `R2_*` de type *sensitive*, en production seulement ; seules `NEXT_PUBLIC_SUPABASE_URL` et la clé *publishable* sont publiques ; **aucune clé `service_role`** n'est déployée (l'application n'en a pas besoin). |
| **Auth** | Le tenant vient du claim `tenant_id` posé par le hook GoTrue, jamais d'une saisie. `/api/files` vérifie le jeton auprès de GoTrue (`getUser`) et compare `sub`. `/api/sync` relaie le jeton à PostgREST, qui le vérifie. |
| **RLS** | 28/28 tables avec RLS **et** au moins une politique ; `anon` n'a aucun droit sur les tables. Toutes les politiques métier sont bornées par `tenant_claim()` **et** `has_permission()`, qui revérifie l'adhésion ACTIVE : un claim falsifié ou un membre désactivé (jeton encore valide 1 h) ne lit ni n'écrit rien (scénarios 12-14, 25-27). |
| **Isolation** | Lecture, modification, création, sync, fichiers, paiements, reçus, réglages, adhésion vers un autre atelier : tout est refusé (scénarios 1-11). |
| **Permissions** | Les rôles sont vérifiés côté base (APPRENTICE ne crée rien, EMPLOYEE n'encaisse pas, personne ne touche aux compteurs ORD/REC), jamais seulement dans l'interface. |
| **API** | `/api/sync` : jeton exigé, lot validé (taille, forme), 500 opérations maximum par lot côté base. `/api/files` : jeton vérifié, catégorie et UUID validés, taille contrôlée avant lecture du corps. |
| **Upload / MIME / taille** | Type déterminé par les **octets** (JPEG, PNG, WebP, PDF), jamais par le nom ou le type annoncé ; SVG/HTML refusés. Plafonds : photo 8 Mo, PDF 5 Mo, corps 4 Mo ; 12 photos par fiche ; un reçu archivé une seule fois et immuable. Contrôles doublés dans `register_file`. |
| **R2 / URLs signées** | Bucket privé, `r2.dev` désactivé. Clés R2 côté serveur uniquement (`server-only`). Clé d'objet `tenants/{atelier}/…` vérifiée par la base (pas de `..`, atelier du JWT) et revérifiée avant signature. Liens GET signés 10 min ; servis depuis le domaine R2, donc sans accès à la session de l'application. |
| **XSS** | Aucun `dangerouslySetInnerHTML`, `eval`, `innerHTML` ou `document.write` ; React échappe tout. Les liens WhatsApp sont construits avec `encodeURIComponent` vers `https://wa.me`. CSP en plus. |
| **CSRF** | Non applicable : l'authentification passe par l'en-tête `Authorization: Bearer`, sans cookie de session. `form-action 'self'` et `frame-ancestors 'none'` en plus. |
| **Injection SQL** | Aucun SQL construit côté application : supabase-js / PostgREST paramètrent tout. Les fonctions PL/pgSQL n'utilisent pas d'`execute` dynamique sur des valeurs reçues. |
| **Logs** | Aucun `console.*` dans `src/` : ni jeton ni donnée client dans les journaux Vercel. |
| **Erreurs exposées** | `/api/files` ne renvoie que des codes (`FORBIDDEN:…`, `NOT_FOUND:…`). Accepté : `sync_push` renvoie `INTERNAL:<message Postgres>` à l'utilisateur authentifié, sur **ses propres** opérations (nom de contrainte au pire). |
| **Rate limiting** | Supabase Auth limite connexions, inscriptions et e-mails. Chaque appel API exige un jeton valide ; lot de sync plafonné ; fichiers plafonnés (S6). Les invitations n'envoient aucun e-mail, donc pas de spam possible. |
| **Dépendances** | `npm audit --omit=dev` : **0 vulnérabilité** dans ce qui est déployé. En développement, 5 alertes `braces` (déni de service par motif glob) dans la chaîne ESLint, qui ne sont jamais exécutées sur une entrée externe. |

## Actions à faire de ton côté

1. **Appliquer `0021` en production** (après accord explicite).
2. Supabase → Authentication → *Leaked password protection* : à activer
   (vérification HaveIBeenPwned ; disponible selon le plan Supabase).
3. Supprimer le jeton `CLOUDFLARE_API_TOKEN` s'il existe encore : il donne
   accès à tous les buckets R2 du compte, et l'application n'en a pas besoin.

## Risques résiduels acceptés

- `'unsafe-inline'` dans `script-src` : Next.js insère ses scripts
  d'hydratation en ligne dans des pages statiques. Un nonce imposerait un
  rendu serveur à chaque page, à revoir à l'étape 25. Les autres directives
  (pas d'`eval`, pas de cadre, connexions limitées) restent actives.
- `pg_trgm` dans `public` (alerte Supabase 0014) : le déplacer reconstruit
  les index de recherche. Sans risque d'exploitation ici.
- Les fichiers supprimés restent dans R2 (suppression logique, traçable).
  La purge physique est à prévoir avec les abonnements (étape 21, quotas).
- Le JWT reste valide jusqu'à 1 h après une désactivation, mais toutes les
  lectures et écritures revérifient l'adhésion (scénarios 25-27).
