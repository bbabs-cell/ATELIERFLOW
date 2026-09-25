# SERVER_SYNC.md — Relais serveur de synchronisation (`sync_push`)

Date : 2026-09-25 — Design de la migration `0010_server_sync.sql` (à valider sur la base réelle, étape hors-ligne suivante de la phase 04).

## 1. Objectif

Rendre le serveur de référence capable de rejouer les lots offline-first du PWA, de façon
**idempotente**, **tenant-scopée** et **financièrement sûre**, sans jamais exposer de REST
direct sur les tables critiques (grants restreints en `0009`).

Point d'entrée unique : RPC `public.sync_push(p_batch jsonb)` — appelé par la passerelle
`POST /api/sync` (`src/app/api/sync/route.ts`) qui propage la session JWT de l'utilisateur.

## 2. Fondements de sécurité (skill auth + audit R2/R3)

| Principe | Mise en œuvre |
|---|---|
| Tenant = contexte authentifié | Le tenant de traitement est **`tenant_claim()`** (claim JWT GT) ; chaque op doit porter un `tenantId` **égal** au claim, sinon `FAILED TENANT_MISMATCH`. Aucune valeur client n'est une source de vérité. |
| Membership re-vérifiée | `is_tenant_member(v_tenant)` (bornée par `auth.uid()`) avant toute application. |
| Permissions re-vérifiées | chaque entité applique les **mêmes** codes que les politiques RLS `0008`, via `has_permission_in(perm, tenant)` — le definer ne saute pas l'autorisation. |
| Écritures critiques | pas de REST direct (0009). Paiements/reçus/compteurs/finance : **définer uniquement**. |
| Jamais d'état client | les références ORD/REC sont **allouées par le serveur** (compteurs `public.counters`, unique tenant/kind/year) ; le payload serveur est la référence canonique retournée au `SYNCED record`. |

## 3. Idempotence — exactement-une-application (sans verrous ad hoc)

- `sync_operations.idempotency_key` est **unique**.
- Par op, dans **une sous-transaction** (bloc `exception` = savepoint) :
  1. **claim** : `insert ... on conflict (idempotency_key) do nothing returning idempotency_key` ;
  2. si le claim gagne → **apply** puis mise à jour de la même ligne vers l'outcome final (SYNCED/FAILED/CONFLICT) **dans la même sous-transaction** ⇒ apply + ledger sont atomiques ;
  3. si le claim perd (clé déjà présente) → **re-ACK** de l'outcome stocké : `SYNCED`→ re-ACK SYNCED (sans ré-exécuter), `FAILED`/`CONFLICT` → restitution, `PENDING`/`SYNCING` → `FAILED IDEMPOTENCY_IN_FLIGHT` (le client re-tente avec backoff, après commit il re-ACK).
- Crash entre apply et réponse : rien de visible n'a committé → nouvel attempt re-applique après re-check ; l'idempotence applicative (références en compteurs, dédupe reçus) ferme les derniers canaux de double effet.
- Deux pushes concurrents même clé : le `unique(idempotency_key)` tronque le perdant sur `do nothing` → re-ACK (`IDEMPOTENCY_IN_FLIGHT` tant que le gagnant est PENDING).
- Toutes les ops d'un lot sont isolées : **une op en erreur ne rejette jamais le lot** (savepoint par op) ; une erreur dure abandonne la sous-transaction (claim roulé) → l'op n'est **pas** gravée, le client la re-verra en échec/retry.

## 4. Stratégie par entité (miroir des politiques RLS 0008)

| Entité | Perm (INSERT/UPDATE/DELETE) | Comportement |
|---|---|---|
| customers | `customers.write` / `customers.write` / `customers.manage` | INSERT/UPDATE directs (tenant épinglé, `created_by`=auth.uid()) ; DELETE = soft `ARCHIVED` + `deleted_at` |
| measurement_profiles | `measurements.write` | INSERT/UPDATE ; DELETE = soft `deleted_at` |
| fabrics | `fabrics.write` | INSERT/UPDATE (quantité numeric) ; DELETE = soft `ARCHIVED` |
| orders | `orders.write` (+`orders.manage` annulation) | INSERT : **référence allouée serveur**, `total_price` validé (bigint ≥ 0), statut/priority whitelist, `created_by`/`employee_id` ; UPDATE : champs whitelist (statut, priorité, dates, notes… — le transitionnel passe par `order_status_history` dédié) ; DELETE non (annuler = UPDATE statut `CANCELLED`) |
| order_items | `orders.write` | INSERT/UPDATE (vérifie l'ordre du tenant) ; DELETE = soft |
| order_status_history | `orders.write` | **append-only** : INSERT ; UPDATE/DELETE → `CONFLICT` |
| measurement_snapshots | `measurements.write` | **append-only** (immuable) : INSERT ; UPDATE/DELETE → `CONFLICT` |
| alterations | `orders.write` | CRUD avec soft-delete, `price ≥ 0` |
| stock_movements | `stock.write` | **append-only** (traçable) : INSERT ; UPDATE/DELETE → `CONFLICT`. `balance_after` recalculé sur `fabrics.quantity` |
| appointments | `appointments.write` | CRUD ; DELETE = `CANCELLED` |
| notifications | (own) | update `read_at` seulement si `recipient_profile_id = auth.uid()` ; sinon `CONFLICT` |
| profiles | (self) | update limité à soi-même |
| tenant_memberships | (self) | acceptation d'invitation `INVITED → ACTIVE` seulement (trigger 0007) ; sinon `CONFLICT`/échec |
| payments | `payments.write` / `payments.cancel` | INSERT validé (montant bigint > 0, ordre du tenant, méthode whitelist) ; UPDATE **uniquement** annulation `VALID→CANCELLED` avec motif ; toute autre écriture → `CONFLICT` (immuabilité) |
| receipts | `receipts.issue` | INSERT only, **référence allouée serveur** + dédupe (reçu même paiement+type → SYNCED de l'existant) ; UPDATE/DELETE → `CONFLICT` (immutables) |
| counters | — | `CONFLICT` (`RPC_ONLY`) |
| files | — | `FAILED FILES_SERVER_MANAGED` (upload via API dédiée + R2) |
| subscriptions, plans, audit_log, sync_operations, tenants, roles, permissions, role_permissions, platform_members | — | `FAILED UNSUPPORTED_ENTITY` |

## 5. Ordre d'application et dépendances

La file client pousse dans l'ordre d'enqueue (création → articles → historique → paiement → reçu).
Cas rare « reçu avant paiement appliqué » : `FAILED PAYMENT_PENDING` documenté — à résoudre
(ordre de queue garanti) ou via un re-traitement manuel.

## 6. Responsabilités partagées (ne pas dupliquer)

- Les **références** ORD/REC : allocations via `public.counters` (upsert incrémental atomique,
  contrainte `unique (tenant_id, kind, label_year)`), format `XXX-YYYY-######`.
- Les **totaux** commandes : validés (`bigint ≥ 0`) mais **non re-calculés** au sync — les
  articles arrivent en ops séparées ; l'exactitude des sommes reste garantie par la logique
  métier client (processus prompt 14, `sumCentimes`) et par l'arithmétique bigint unique
  (skill finance). Les montants `payments.amount`/`total_price` restent des bigint vérifiés.
- Les reçus : montant, méthode et état recalculés **depuis la base** (`payments.amount`,
  somme des paiements VALID de la commande) — jamais depuis le payload.

## 7. Plan de validation (sur la base réelle, après `supabase db push` 0000→0010)

1. Rejeu des **22 scénarios d'isolation** (docs/SECURITY.md) : rien ne doit casser malgré les grants 0009.
2. **Concurrence** : deux push simultanés même `idempotency_key` → un seul effet, re-ACK.
3. **Replay** : renvoyer un lot déjà `SYNCED` → re-ACK sans ré-application (compteurs stables).
4. **Finance** : commande 3 articles (prix centimes), paiement, reçu → références cohérentes
   `ORD-`/`REC-`, unicité `(tenant_id, reference)`, solde = somme des paiements validés.
5. **Permissions** : chaque tentative cross-perm (ex. APPRENTICE écrit `payments`) → `FAILED`.
6. **Fuzz du contrat** : lots malformés, `tenantId ≠ claim`, entités inconnues → erreurs propres.

## 8. Points de vigilance (release notes)

- `sync_operations.outcome` (colonne ajoutée) stocke l'outcome canonique pour le re-ACK.
- Double garde financière : `payments.idempotency_key` = clé de l'op → un replay d'un paiement
  appliqué est neutralisé même si le ledger était purgé.
- Les transitions de statut de commande transitent par l'entité `order_status_history`
  (**append-only**, INSERT uniquement) — le serveur n'écrit pas d'historique à la place du client.
- `EXACTLY_ONCE` : toute logique d'application doit rester **dans la sous-transaction du claim** —
  ne jamais extraire l'application hors du bloc d'idempotence.
- Les fonctions sont `SECURITY DEFINER` avec `set search_path = public` ; toutes les tables sont
  accédées en qualifications `public.*`. L'exécution du RPC est restreinte à
  `authenticated`/`service_role`.