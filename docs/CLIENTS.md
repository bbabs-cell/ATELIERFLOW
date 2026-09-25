# CLIENTS.md — Clients & mesures (Prompt 13)

Date : 2026-09-24 — Carnet de clients, fiches contact, profils et snapshots de mesures.
Vérifié : typecheck, lint, build prod, 57 tests verts (dont 10 nouveaux pour clients/mesures).

## 1. Portée

- **Clients** : liste + recherche (nom/téléphone), création, édition, archivage (soft-delete). Règle métier : un téléphone actif ne se réinscrit pas dans le même tenant (un client archivé peut le reprendre).
- **Mesures** : profils de mesures (ex : Costume homme, Robe de mariée) avec champs nommés (nombre en cm ou texte), snapshots immuables par client (historique), affichage hydraté avec libellés + unités.
- **Offline-first** : lecture/écriture locales instantanées (IndexedDB), chaque écriture journalisée en file de synchronisation idempotente (Prompt 11) — jamais de doublon côté serveur.

## 2. Architecture (couches existantes réutilisées)

```
src/domain/clients/customer.ts         règles pures : normalisation, validation, statuts, doublons téléphone
src/domain/clients/measurements.ts     profils, champs, snapshots, hydration
src/domain/ids/idempotency.ts          (uuid v4, réutilisé)
src/repository/ports/clients.ts        contrats Customers/Profiles/SnapshotsRepository
src/repository/local/clients.ts        implémentation IndexedDB sur LocalCachePort
src/repository/local/indexeddb/cache.ts (list() ajouté : LocalCachePort.list(entity))
src/application/clients/clientService.ts      cas d'usage clients (résultats typés, erreurs métier)
src/application/clients/measurementService.ts cas d'usage mesures
src/features/clients/facade.ts         composition singleton (tenant de démonstration)
src/features/clients/ClientsView.tsx   écran (liste + fiche + dialogs)
src/features/clients/ClientsList.tsx   liste avec recherche (états loading/empty/error)
src/features/clients/CustomerForm.tsx  formulaire création/édition (validation inline)
src/features/clients/MeasurementsPanel.tsx  profils + saisie + dernières mesures
src/features/clients/ProfileForm.tsx   création de profil de mesures
src/app/clients/page.tsx               route /clients
```

Règles pures testées en unité ; services + synchronisation testés en intégration avec
fake-indexeddb et un serveur de sync simulé (déduplication par `idempotencyKey`).

## 3. Décisions clés

- **Snake_case côté données** : les enregistrements épousent le schéma PostgreSQL
  (0001) — le `payload` des `SyncOperation` et le contrat wire sont identiques, pas de mapping en transit.
- **Aucune suppression destructive** : archivage par statut (`ARCHIVED`), `deleted_at` inchangé (prévu pour les suppressions réelles serveur).
- **LocalCachePort.list(entity)** : scan du store `records` filtré par préfixe `entity::` —
  suffisant localement, remplaçable par un index IDB ou une recherche Postgres (phase 04)
  sans changer les contrats.
- **UI de démonstration** : le tenant/profile de démonstration est un UUID constant
  (`src/features/clients/constants.ts`), remplacé par la session réelle (Prompt 19, équipe/permissions)
  — il n'est pas une dépendance métier.
- Pas de `console.error` muet : les erreurs remontent à l'écran (états error/retry).

## 4. Tests

`tests/unit/clients/customer.test.ts` — normalisation, validation contact, recherche, archivage, doublon téléphone.
`tests/unit/clients/measurements.test.ts` — profils (clés/unités/types, doublons, limite), snapshots (valeurs ignorées), snapshot le plus récent, hydration.
`tests/integration/clients/clientService.test.ts` — création/édition/archivage persistés localement, doublons actifs vs archivés, enfilement INSERT/UPDATE, flush idempotent, profils + snapshots poussés en sync.

## 5. À faire (phases avancées / provisionnement)

- Remplacer le tenant de démonstration par la session (Prompt 19) ; brancher l'adaptateur réel
  (route `POST /api/sync` déployée phase 04) sur `remote` du moteur de sync — déjà prévu par contrat.
- Recherche : passer de la recherche locale par filtre à `pg_trgm` postgres (index `customers_search_idx` en 0001).
- Snapshots liés à une commande (`order_id`) et photos clients (R2, Prompt 18).