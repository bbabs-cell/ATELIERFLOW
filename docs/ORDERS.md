# ORDERS.md — Commandes, workflow & argent (Prompt 14)

Date : 2026-09-25 — Création, suivi d'atelier et argent des commandes.
Vérifié : typecheck, lint, build prod, 83 tests verts (dont 26 nouveaux pour argent + commandes).

## 1. Portée

- **Commandes** : liste + recherche (référence / client), création avec articles dynamiques
  (quantité, prix unitaire, type de vêtement), fiche de détail, workflow 10 statuts avec
  historique immuable, annulation « douce » (raison obligatoire, jamais de suppression).
- **Argent exact** : entiers `bigint` exprimés en centimes ; calcul ligne par ligne et total
  re-calculés, jamais de virgule flottante.
- **Offline-first** : like clients — écritures locales instantanées (IndexedDB) + file de sync
  idempotente. `orders` + `order_items` (sensitive) et `order_status_history` (financial)
  sont poussés en sync ensemble dans un même flush.

## 2. Architecture

```
src/domain/money.ts                       centimes : parse/format, lineTotal, sumCentimes
src/domain/orders/order.ts                statuts, priorités, références, machine à états
src/repository/ports/orders.ts            contrats Orders/OrderItems/OrderHistoryRepository
src/repository/local/orders.ts            implémentation IndexedDB (entités orders, order_items, order_status_history)
src/application/orders/orderService.ts    cas d'usage commandes (création, workflow, annulation, recherche)
src/features/orders/facade.ts             composition singleton (moteur de sync partagé avec clients)
src/features/orders/constants.ts          libellés/tonalités statuts & priorités, types de vêtement
src/features/orders/OrdersView.tsx        écran (liste + fiche + dialogs)
src/features/orders/OrdersList.tsx        liste avec recherche (états loading/empty/error)
src/features/orders/OrderForm.tsx         création : client, priorité, articles dynamiques, total
src/features/orders/OrderDetail.tsx       fiche : articles, montant, transitions, historique
src/app/commandes/page.tsx                route /commandes
```

## 3. Règles métier (feldspath → domaine pur)

### Argent (`src/domain/money.ts`)
- Tous les montants sont des `number` entiers en **centimes** (`Number.isSafeInteger`).
- `parseEurosToCentimes("25,50")` → 2550 ; formatage `formatEuros(2550)` → `25,50 €`
  (espace insécable `\u00A0` pour les milliers).
- `lineTotal` refuse quantité < 1 ou prix < 0 ; tout total non sûr invalide la commande.

### Références (`ORD-YYYY-XXXXXX`)
- Séquence par tenant et par année civile, dérivée de la convention des reçus
  `REC-YYYY-XXXXXX` (finance). `unique (tenant_id, reference)` en base (0001).
- `nextOrderSequence` prend en compte toutes les références existantes localement ;
  l'unicité globale est garantie côté serveur par la contrainte + idempotence (phase 04).

### Machine à états (`ORDER_FLOW`)
```
REGISTERED → FABRIC_RECEIVED → PREPARATION → SEWING → FITTING → ALTERATION →
COMPLETED → READY_FOR_PICKUP → DELIVERED
```
- **Avant** : sauts directs autorisés (tout statut « après » est atteignable).
- **Arrière** : limité aux reprises d'atelier (1 à 2 paliers, table `BACKWARD_ALLOWED`).
- **Terminal** : `DELIVERED` et `CANCELLED` ne peuvent plus bouger — la livraison déclenche
  le calcul financier, la réverser corromprait l'argent.
- **Annulation** : possible depuis tout statut non terminal, **raison obligatoire**,
  conserve l'ordre (statut `CANCELLED`) et journalise l'entrée d'historique.
- L'entrée initiale (`from_status: null → REGISTERED`) est écrite directement, pas via
  `transitionOrder` (qui interdit le statut inchangé).

### Historique (`order_status_history`)
- Entité **financial** : jamais LWW — chaque transition INSERT une ligne immuable
  (from/to, auteur, note, createdAt) ; `availableTransitions(from)` pilote l'UI.

## 4. Décisions d'intégration

- La **facade commandes réutilise le moteur de sync de la façade clients**
  (même tenant de démonstration, même file IndexedDB) : un seul statut « en attente »
  pour toute l'application ; les stores `orders` sont ouverts sur le même cache DB.
- UI strictement offline-first comme clients : états loading / empty / error / retry,
  transitions déclenchées puis liste + fiche rechargées localement.

## 5. Tests

`tests/unit/orders/money.test.ts` — centimes partout, formatage, lineTotal, sommes, refus de montants non sûrs.
`tests/unit/orders/order.test.ts` — références (format, séquence déduite), machine à états (avant, sauts, arrière limité, terminaux, annulation raison obligatoire), validation des drafts.
`tests/integration/orders/orderService.test.ts` — création persistée + calcul total, séquence par tenant, workflow complet avec historique immuable, annulation sans suppression, recherche/filtre annulées, flush idempotent (orders + items + historique).

## 6. À faire (phases avancées / provisionnement)

- Session réelle (Prompt 19) + branchement `POST /api/sync` (phase 04) pour la contrainte
  serveur de référence et la recherche `pg_trgm` (phase 04) — contrats déjà en place et testés.
- Relié à la finance (Prompt 15) : à la livraison (`DELIVERED`), ouverture du paiement ;
  reçus `REC-YYYY-XXXXXX` ; rapprochement solde/commande.
- Photos tissus/corps (R2, Prompt 18) à rattacher aux articles (`fabric_id`), et
  profil de mesures lié (`measurement_profile_id`) déjà présent dans le draft.