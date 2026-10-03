# Abonnements SaaS (étape 21)

Trois notions : **Plan** (catalogue : prix, limites, fonctions), **Subscription**
(le plan souscrit par un atelier, avec ses dates) et **Entitlements** (les
droits effectifs calculés à partir des deux). Les prix, limites, durées d'essai
et délais de grâce vivent en base (`public.plans`) : ils se changent sans
toucher au code. Aucune limite n'est écrite dans les pages.

## Plans initiaux (`0005`, complétés par `0022`)

| Plan | Prix / mois | Clients | Commandes en cours | Utilisateurs | Stockage | WhatsApp | Stock | Audit | Essai |
|---|---|---|---|---|---|---|---|---|---|
| `FREE` Découverte (par défaut) | 0 | 30 | 60 | 1 | 200 Mo | ✗ | ✗ | ✗ | — |
| `BASIC` Essentiel | 5 000 F CFA | 300 | 1 000 | 3 | 2 Go | ✓ | ✓ | ✗ | — |
| `PRO` Atelier pro | 10 000 F CFA | 5 000 | 20 000 | 15 | 10 Go | ✓ | ✓ | ✓ | 14 jours |

Clés de `plans.limits` : `users_max`, `customers_max`, `orders_max`,
`storage_mb` (nombre ; absent ou négatif = illimité) et `whatsapp`, `stock`,
`audit` (booléens). Autres colonnes : `trial_days` (essai offert à la création
d'un atelier), `grace_days` (délai après échéance, 3 par défaut), `is_default`
(plan appliqué sans abonnement valide).

## Cycle de vie (calculé à la lecture, sans tâche planifiée)

| État | Condition | Plan appliqué |
|---|---|---|
| `TRIAL` | essai, `trial_ends_at` non dépassé | plan de l'essai |
| `ACTIVE` | payé, `current_period_end` non dépassé (ou sans échéance) | plan souscrit |
| `GRACE` | échéance dépassée depuis moins de `grace_days` | plan souscrit |
| `EXPIRED` | essai ou échéance + grâce dépassés | plan par défaut (FREE) |

Les données ne sont **jamais** supprimées ni bloquées en lecture. Seules les
nouvelles créations au-delà des limites sont refusées.

- **Nouvel atelier** : déclencheur `tenants_start_trial_after` → essai sur le plan
  qui propose `trial_days` (PRO, 14 jours). Les ateliers existants reçoivent le
  même essai à l'application de `0022`.
- **Changement de plan** (OWNER, permission `tenant.settings`) :
  - plan gratuit : appliqué tout de suite si l'usage tient dans ses limites,
    sinon `PLAN_LIMIT:<ressource>` ;
  - plan payant : **demande** enregistrée (`requested_plan_id`) ; l'atelier garde
    son plan jusqu'à l'activation par la plateforme après paiement (Wave, Orange
    Money, espèces) ; demande annulable.
- **Plateforme** (SAAS_ADMIN, page `/plateforme`) : liste des ateliers (compteurs
  seulement, jamais de données métier), demandes en attente en tête, activation
  d'un plan pour 1 à 36 mois ou sans échéance, prolongation d'essai,
  modification des prix et limites. Un abonnement en cours garde son prix figé
  jusqu'au renouvellement.

## Application des limites (serveur)

Déclencheur `enforce_plan_limits` (BEFORE INSERT) : il s'applique quelle que
soit la voie d'entrée (sync, RPC, REST).

| Ressource | Table | Refus |
|---|---|---|
| Clients actifs | `customers` | `PLAN_LIMIT:customers` |
| Commandes en cours (hors livrées / annulées) | `orders` | `PLAN_LIMIT:orders` |
| Membres actifs | `tenant_memberships` (quand une adhésion devient active) | `PLAN_LIMIT:users` |
| Membres + invitations en attente | `tenant_invitations` | `PLAN_LIMIT:users` |
| Stockage des fichiers non supprimés | `files` | `PLAN_LIMIT:storage` |
| Fonction stock | `fabrics`, `stock_movements` | `PLAN_FEATURE:stock` |

`sync_push` renvoie ces codes tels quels. Les rappels WhatsApp ouvrent
`wa.me` dans le navigateur : il n'y a rien à refuser côté serveur, la fonction
est donc masquée dans l'interface seulement.

## RPC (`0022`)

| Fonction | Qui | Rôle |
|---|---|---|
| `my_entitlements()` | tout membre actif | plan effectif, état, dates, usage, catalogue |
| `request_plan_change(code \| null)` | OWNER | plan gratuit immédiat, demande de plan payant, annulation |
| `admin_list_tenants()` | SAAS_ADMIN | ateliers, droits, compteurs |
| `admin_set_subscription(atelier, plan, mois, jours_essai)` | SAAS_ADMIN | activation après paiement ou essai |
| `admin_update_plan(code, prix, limites, jours_essai, actif)` | SAAS_ADMIN | catalogue (limites validées) |

Les fonctions internes (`tenant_entitlements`, `tenant_usage`, `plan_limit`,
déclencheurs) sont fermées à l'API.

## Application

- `src/domain/subscriptions/entitlements.ts` : lecture défensive des droits,
  `canAdd`, `featureEnabled`, jauges, échéances, messages en français.
- `src/infrastructure/subscriptions/subscriptionRemote.ts` : appels RPC.
- `src/features/subscriptions/useEntitlements.ts` : droits partagés par tous
  les écrans, mis en cache local par atelier pour prévenir aussi hors ligne.
- `PlanGate.tsx` : **prévention avant création**. Nouveau client, nouvelle
  commande, invitation, tissu ou mouvement de stock, message WhatsApp :
  au-delà du plan, une fenêtre l'explique au lieu d'ouvrir le formulaire. Le
  décompte retient le plus grand entre le serveur et l'appareil (créations
  hors ligne).
- `PlanBanner.tsx` : bandeau en haut de l'application.
  - Enregistrements **refusés** par le serveur (créés hors ligne au-delà du
    plan) : ils restent sur l'appareil ; « Réessayer » les renvoie après un
    changement de plan, avec une nouvelle clé d'idempotence et leurs
    dépendances, dans l'ordre d'origine (`SyncEngine.retryRefused`).
  - Fin d'essai (5 derniers jours), paiement attendu, abonnement expiré.
- `/abonnement` (OWNER et MANAGER) : plan, état, jauges, fonctions, catalogue
  et actions de changement (OWNER).
- `/plateforme` (menu visible pour SAAS_ADMIN seulement ; chaque action est
  revérifiée par la base).

## Vérifications

- `supabase/validations/subscriptions_local.sql` : 28/28 sur base vierge
  0000 → 0022. Couvre l'essai, la lecture par un membre, les refus de rôle et
  de faux jeton, la demande puis l'activation, les limites clients, commandes,
  utilisateurs, stockage et stock, la rétrogradation refusée, la grâce,
  l'expiration et la conservation des données.
- `security_attacks_local.sql` 31/31, invitations 20/20, rendez-vous 8/8,
  fichiers 15/15 sur la même base.
- Tests : `tests/unit/subscriptions/entitlements.test.ts`,
  `tests/integration/sync/planRefusals.test.ts`.
- Parcours rejoué dans Chromium (passerelle locale) :
  - page en essai, puis blocage à la limite de clients ;
  - refus serveur affiché, puis renvoyé après changement de plan ;
  - demande de plan, puis activation depuis `/plateforme` ;
  - stock verrouillé sur FREE ;
  - 360 px sans débordement, 0 erreur console ou CSP.

## Production (2026-10-03)

- `0022` appliquée en quatre lots (`0022`, `0022.2`, `0022.3`, `0022.4` dans
  `supabase_migrations.schema_migrations`), au contenu identique au fichier.
- Le propriétaire de la plateforme est SAAS_ADMIN (`platform_members`). Son
  atelier est en `PRO` ACTIVE sans échéance, prix figé à 0.
- Vérifié avec son compte : `my_entitlements` renvoie PRO / ACTIVE avec l'usage
  réel, `admin_list_tenants` répond, la synchronisation renvoie les codes
  `PLAN_*`. Supabase ne signale aucune nouvelle alerte de sécurité.
