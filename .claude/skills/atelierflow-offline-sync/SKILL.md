---
name: atelierflow-offline-sync
description: Use when implementing or debugging offline-first behavior, IndexedDB, local repositories, sync queue, idempotency, conflict resolution, or online/offline detection for the atelierflow SaaS, including its PWA service worker. Trigger keywords: offline, sync, queue, IndexedDB, idempotency, conflict, retry, PWA, service worker, connexion.
---

# atelierflow-offline-sync

Offline-first réel : on écrit localement pour garantir réactivité, on synchronise avec Supabase de façon **idempotente** et **sans perte**.

## Modèle d'opération (SyncOperation)

Chaque opération locale possède :
`idempotency_key` (uuid unique), `tenant_id`, `entity`, `entity_id`, `operation` (INSERT/UPDATE/DELETE), `payload` (JSON), `created_at`, `status`, `retry_count`, `last_error`.

Statuts :
- `PENDING` → `SYNCING` → `SYNCED`
- `FAILED` (après retry épuisé, visible à l'utilisateur, pas silencieux)
- `CONFLICT` (à réviser)

## Règles

- **Idempotence** : le serveur doit rejeter sans effet un push dont `idempotency_key` est déjà appliqué. Un double-push ne produit jamais de double paiement ni double commande.
- **Retry contrôlé** : backoff progressif, `retry_count` plafonné, puis `FAILED` avec message d'erreur exploitable.
- **Reprise après coupure** : la queue reprend là où elle s'était arrêtée (pas de doublon, pas de perte), replanifiée après reconnexion (`online`/`offline` événements).
- **Financial hardening** : avant d'appliquer un paiement, re-valider le contexte local (recalcul de solde depuis l'état local confirmé) ; les conflits financiers ne sont **jamais** résolus en last-write-wins automatique — passage `CONFLICT` + révision manuelle (cf. atelierflow-finance).
- **Conflits non-financiers** : politique par entité (métadonnées last-write-wins conservées côté serveur en copie de référence ; données sensibles → révision).
- **Ne jamais masquer les données privées** : les données locales restent protégées (IndexedDB chiffrée-ou-cloisonnée par tenant, purge à la déconnexion si demandé).

## PWA / Service worker

- Ne cacher que ce qui est **nécessaire et sûr** : shells, assets statiques, api routes publiques non sensibles. Jamais de données privées en cache incontrôlé.
- Mise à jour contrôlée : nouveau SW en attente (« skip while waiting » seulement après validation), notification de mise à jour.
- Écran offline explicite + indicateur d'état de sync globlal visible.

## Tests de sync exigés

1. coupure pendant un push → reprise sans doublon ;
2. double push de la même opération → 1 seule application ;
3. passage offline → online sans perte ni doublement ;
4. conflit financier → CONFLICT, pas d'écrasement.