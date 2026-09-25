# SYNC.md — Offline-first et synchronisation idempotente (Prompt 11)

Date : 2026-09-24 — Moteur offline livré et testé : 19 tests (unit + intégration IndexedDB via `fake-indexeddb`).

## 1. Modèle d'opération (`SyncOperation`)

Chaque écriture locale est une opération avec **`idempotency_key` (uuid)** générée côté client à l'enqueue :

`tenant_id`, `entity`, `entity_id`, `operation` (INSERT | UPDATE | DELETE), `payload` (JSON), `created_at`, `status`, `retry_count`, `last_error`, `last_attempt_at`.

Statuts : `PENDING → SYNCING → SYNCED` ; `FAILED` (visible, jamais silencieux) ; `CONFLICT` (à réviser).

Table serveur de référence : `public.sync_operations` (migration `0006_sync.sql`, RLS en `0008`).

## 2. Garanties

- **Idempotence** : le serveur rejette sans effet un push dont `idempotency_key` est déjà appliqué (`unique` sur la colonne + application unique) → un double-push ne produit jamais un double paiement ni une double commande. Testé : double transmission = 1 seule application.
- **Retry contrôlé** : backoff progressif par `retry_count` (`0 → 0s, 1 → 2s, 2 → 5s, 3 → 15s, 4 → 60s, ≥5 → 300s`), plafond `MAX_RETRY_COUNT = 5`, puis rejet terminal explicite.
- **Reprise après coupure** : garde in-flight (jamais deux pushes simultanés) ; une opération `SYNCING` orpheline (réponse perdue après application serveur) est re-mise `PENDING` (`requeueStuck`) puis re-poussée ; le serveur re-ACK sans ré-appliquer → **pas de doublon**.
- **Offline → online** : la queue est conservée et vidée au retour ; rien n'est perdu, rien n'est dupliqué (événements `online`/`offline` → `flush`).
- **Financial hardening** : les entités financières (`payments`, `receipts`, `subscriptions`, `order_status_history`, `stock_movements`) n'acceptent **jamais** le last-write-wins automatique. Conflit serveur → `CONFLICT` + révision manuelle ; le record serveur n'écrase jamais le local. (Mis en œuvre de bout en bout avec les API financières en prompt 15.)

## 3. Politique de conflit par classe d'entité

| Classe | Entités | Résolution |
|---|---|---|
| `metadata` | flags, préférences, cache serveur | last-write-wins, **serveur = référence** (cache mis à jour au SYNCED) |
| `sensitive` | customers, orders, mesures, RDV | révision manuelle probable (détection côté prompt 19/20) |
| `financial` | payments, receipts, subscriptions, historique, stock | **toujours** `CONFLICT` + révision manuelle |

## 4. Couches et fichiers

```
src/domain/sync/            types, queuePolicy (backoff), conflictPolicy (classes)
src/domain/ids/idempotency  newIdempotencyKey() (uuid v4)
src/repository/ports/sync   SyncQueuePort, LocalCachePort, RemoteSyncPort + toWireOperation
src/repository/local/indexeddb  db/queue/cache (IndexedDB cloisonnée par tenant)
src/application/sync/engine SyncEngine (enqueue, flush, backoff, requeueStuck, garde in-flight)
src/infrastructure/sync/    remoteHttp (contrat POST /api/sync), indexedDbEngine (composition)
src/infrastructure/network/ onlineDetector
tests/unit/sync/            queuePolicy, conflictPolicy, idempotency
tests/integration/sync/     scénarios exigés (fake-indexeddb + fake server du contrat)
```

Données locales : base IndexedDB `atelierflow:{tenantId}:1` (cloisonnée par tenant) ; stores `operations`, `records`, `meta`. Purge à la déconnexion si demandée : `purgeTenantLocalData(tenantId)`.

## 5. Contrat serveur `POST /api/sync` — passerelle livrée (phase 04, code offline)

```
Requête :  { batch: [{ idempotencyKey, tenantId, entity, entityId, operation, payload, createdAt }] }
Réponse :  { results: [{ idempotencyKey,
     outcome: { kind: "SYNCED",   record?: <instantané canonique> }
            | { kind: "FAILED",   error: string }   // rejet définitif (validation)
            | { kind: "CONFLICT", reason: string } }] }  // financier/sensible → révision
```

**Côté client (livré, provisionné)**
- `createRemoteSync()` (`src/infrastructure/sync/chooseRemote.ts`) choisit le transport réel (`createHttpRemoteSync` → `POST /api/sync`) **si** `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` sont renseignés, sinon un stub qui lève `REMOTE_SYNC_NOT_PROVISIONED` (jamais de faux backend : l'opération reste en file, requeue). Toutes les facades passent par ce choix.
- `syncRelay.ts` : validation du lot (`validateSyncPushBody` — opérations WHITE-LIST `INSERT|UPDATE|DELETE`, lot ≤ 200), relais via comparse `fetch` vers `{SUPABASE_URL}/rest/v1/rpc/sync_push` en **propageant la session `Authorization` de l'utilisateur** (pas de clé service), mapping `SYNCED/CONFLICT/FAILED` (`mapSyncPushRpc`) et enveloppe d'erreurs `{ error: { code, message } }`.
- `POST /api/sync` (`src/app/api/sync/route.ts`) : 501 si env absent, 401 sans session, 400 sur lot invalide, sinon relay. Le RPC nom est surchargeable via `NEXT_PUBLIC_SYNC_RPC` (défaut `sync_push`).

Implémentation serveur attendue (migration 0010 — prochaine étape hors-ligne) :
1. `sync_push(p_batch)` SECURITY DEFINER : insertion `INSERT ... ON CONFLICT (idempotency_key) DO NOTHING` dans `sync_operations` → **un seul traitement** par clé ; re-vérifie l'appartenance au tenant (`auth.uid()` + `tenant_memberships`) indépendamment du `tenantId` fourni.
2. dedupe avant application : clé déjà appliquée → re-ACK `SYNCED` sans ré-exécution.
3. entités financières : applicables via leurs propres endpoints idempotents (prompt 15), jamais un INSERT SQL brut — immutabilité, séquence REC, compteurs.
4. erreurs API au format unique `{ error: { code, message, details? } }`.

## 6. Les 4 tests de sync exigés (tous verts)

1. Coupure pendant un push → reprise sans doublon (réponse perdue après application serveur : 2 transmissions, 1 application).
2. Double push de la même opération (même `idempotency_key`) → 1 seule application.
3. Passage offline → online sans perte ni doublement.
4. Conflit financier → `CONFLICT`, aucun écrasement du local (y compris record serveur fourni au SYNCED ignoré sur les entités financières).

Exécution : `npm run test` (vitest). Typecheck/lint/build intégrés : `npm run typecheck`, `npm run lint`, `npm run build`.