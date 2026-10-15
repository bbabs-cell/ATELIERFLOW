# ORDERS.md — Commandes, workflow & argent (Prompt 14)

Date : 2026-09-25 — Création, suivi d'atelier et argent des commandes.
Vérifié : typecheck, lint, build prod, 83 tests verts (dont 26 nouveaux pour argent + commandes).

## 1. Portée

- **Commandes** : liste + recherche (référence / client), création avec articles dynamiques
  (quantité, prix unitaire, type de vêtement), fiche de détail, workflow 10 statuts avec
  historique immuable, annulation « douce » (raison obligatoire, jamais de suppression).
- **Argent exact** : entiers `bigint` exprimés en F CFA (XOF, sans sous-unité) ; calcul ligne par ligne et total
  re-calculés, jamais de virgule flottante.
- **Offline-first** : like clients — écritures locales instantanées (IndexedDB) + file de sync
  idempotente. `orders` + `order_items` (sensitive) et `order_status_history` (financial)
  sont poussés en sync ensemble dans un même flush.

## 2. Architecture

```
src/domain/money.ts                       F CFA : parseFcfa/formatFcfa, lineTotal, sumAmounts
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
- Tous les montants sont des `number` entiers en **F CFA** (`Number.isSafeInteger`).
- `parseFcfa("50 000")` → 50000 ; formatage `formatFcfa(50000)` → `50 000 F CFA` (décimales refusées)
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

`tests/unit/orders/money.test.ts` — F CFA entiers partout, formatage, lineTotal, sommes, refus de montants non sûrs.
`tests/unit/orders/order.test.ts` — références (format, séquence déduite), machine à états (avant, sauts, arrière limité, terminaux, annulation raison obligatoire), validation des drafts.
`tests/integration/orders/orderService.test.ts` — création persistée + calcul total, séquence par tenant, workflow complet avec historique immuable, annulation sans suppression, recherche/filtre annulées, flush idempotent (orders + items + historique).

## 6. À faire (phases avancées / provisionnement)

- Session réelle (Prompt 19) + branchement `POST /api/sync` (phase 04) pour la contrainte
  serveur de référence et la recherche `pg_trgm` (phase 04) — contrats déjà en place et testés.
- Relié à la finance (Prompt 15) : à la livraison (`DELIVERED`), ouverture du paiement ;
  reçus `REC-YYYY-XXXXXX` ; rapprochement solde/commande.
- Photos tissus/corps (R2, Prompt 18) à rattacher aux articles (`fabric_id`), et
  profil de mesures lié (`measurement_profile_id`) déjà présent dans le draft.
## Kanban atelier et affectation (prompt 14, complément)

- **Vue Atelier** (par défaut, mémorisée par appareil) / **Liste** sur `/commandes`. Une colonne par étape du flux (`ORDER_FLOW`), annulées exclues ; défilement horizontal, une colonne par écran sur mobile.
- **Déplacements** : glisser-déposer (ordinateur) ou bouton « étape suivante » sur chaque carte (tactile). Tout passage est validé par `canDrop` = `canTransition` du domaine, l'annulation reste réservée au détail (raison obligatoire) ; un passage interdit est refusé avec un message. Chaque déplacement passe par `orderService.transition` : historique conservé, synchronisé.
- **Retards** (`deadlineState`) : date prévue passée → « n j de retard » (barre rose qui pulse) ; jour même → « Aujourd'hui » ; ≤ 2 jours → date en orange. Jamais en retard une fois prête à retirer, livrée ou annulée.
- **Tri dans une colonne** : retard, priorité (Urgente → Basse), échéance la plus proche, ancienneté.
- **Filtres** (Liste et Atelier) : priorité, personne affectée / non affectées, « En retard » (avec compteur).
- **Affectation** : sélecteur « Affectée à » dans le détail (membres ACTIVE de l'équipe ; « Moi » seul sans droit `team.read`) ; `orderService.assign(id, profil | null)`. Seule cette opération envoie `employee_id` : les autres modifications l'omettent pour ne jamais écraser une affectation faite depuis un autre appareil. Côté serveur (`0018`), la clé présente fait foi (null = retrait) et la personne doit être membre ACTIVE de l'atelier.

## Commande → rendez-vous (2026-10-04)

À la création d'une commande avec une date de livraison, un rendez-vous lié à la
commande est noté dans le calendrier (case cochée par défaut, type Livraison / Retrait /
Essayage, heure 10 h modifiable). Le rendez-vous suit ensuite la commande : livrée →
terminé, annulée → annulé (`src/domain/appointments/fromOrder.ts`,
`src/features/orders/orderAppointments.ts`). Réservé aux rôles qui peuvent gérer les
rendez-vous.

## Commandes en 4 étapes, pour tous (2026-10-15)

**Le problème** : 9 étapes pour suivre un habit (enregistrée, tissu reçu, préparation, couture,
essayage, retouches, terminée, à retirer, livrée) — « trop d'étapes », et l'écran doit se
comprendre même par quelqu'un qui n'a jamais été à l'école.

**Ce qui change**
- 4 étapes, chacune avec une image et une couleur : **Reçue** (boîte), **En couture**
  (ciseaux), **Prête** (paquet), **Livrée** (poignée de main) — `src/domain/orders/stages.ts`.
- Téléphone : 4 grosses images avec le nombre de commandes ; on touche une étape, ses
  commandes s'affichent. Ordinateur : 4 colonnes (glisser-déposer gardé).
- Carte : nom du client en grand, l'habit, l'échéance **en mots** (« Demain », « En retard de
  2 jours »), le prix, et **un seul gros bouton** (image + un verbe) : « Commencer », « C'est
  prêt », « Remise au client ». Le **haut-parleur** lit la commande à voix haute (voix du
  téléphone, `src/infrastructure/speech/speak.ts`, texte `orderSpeech.ts`).
- Détail de la commande : les 4 étapes en images, le bouton de l'étape suivante, « Revenir »
  pour corriger un toucher par erreur, « Annuler la commande ».
- Partout (liste, badges, assistant, historique) une commande est « Reçue », « En couture »,
  « Prête » ou « Livrée ».

**Règles et pourquoi**
- **Aucune migration** : les statuts enregistrés restent les mêmes (historique,
  synchronisation, base, rendez-vous liés). Chaque étape entre par un statut
  (`STAGE_STATUS` : REGISTERED, SEWING, READY_FOR_PICKUP, DELIVERED) ; les commandes anciennes
  à une étape intermédiaire (essayage, retouches…) sont rangées dans l'étape qui les contient
  et avancent normalement.
- Retour d'une seule étape (couture → reçue, prête → couture) : `BACKWARD_ALLOWED` accepte
  désormais couture/essayage/retouches → enregistrée. Jamais de retour après la livraison.
- Une commande prête n'est plus « en retard ».
- Le bouton de carte est en style secondaire (fond doux) : la couleur pleine reste au seul
  bouton principal de l'écran (« Nouvelle commande »).

**Tests** : `tests/unit/orders/stages.test.ts`, `board.test.ts` (4 colonnes, déplacements,
échéance en mots), `orderSpeech.test.ts`.

## Mesures à la prise de commande (2026-10-15)

Dans « Nouvelle commande », la partie **Mesures du client** : les mesures de base sont prêtes
(tour de cou, épaules, poitrine, taille, hanches, manches, longueurs…), sans profil à créer.
Pour un client enregistré, ses dernières mesures sont déjà remplies : on ne change que ce qui a
changé. À l'enregistrement, les mesures sont gardées **pour le client et liées à la commande**
(`measurement_snapshots.order_id`, colonne existante — aucune migration) ; le détail de la
commande affiche « Mesures de cette commande ». Si l'atelier a créé des profils (Boubou,
Pantalon…), on choisit le profil en un toucher. Rôle sans le droit `measurements.write` : la
partie n'est pas affichée (le serveur refuse de toute façon). Tests :
`tests/integration/clients/clientService.test.ts` (mesures de base liées à la commande, rien
n'est écrit sans mesure).
