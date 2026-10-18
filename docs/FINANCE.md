# FINANCE.md — Paiements & solde (Prompt 15)

Date : 2026-09-25 — Encaissements, annulations douces, solde re-calculé en continu.
Vérifié : typecheck, lint, build prod, 94 tests verts (dont 11 nouveaux pour la finance).

## 1. Portée

- **Encaisser un paiement** sur une commande : montant, mode (`CASH`, `ORANGE_MONEY`,
  `MOOV_MONEY`, `WAVE`, `TRANSFER`, `OTHER`), note facultative.
- **Annulation douce** : jamais de suppression physique — statut `CANCELLED` +
  `cancelled_at`, `cancelled_by`, `cancellation_reason` obligatoire.
- **Solde toujours re-calculé** à partir des paiements `VALID` (jamais stocké).
- **Surplus** : un trop-perçu devient un crédit à reporter/rembourser, jamais détruit ;
  l'annulation du dernier paiement ramène exactement au solde antérieur.
- **Idempotence** : chaque paiement porte un `idempotency_key` uuid (contrainte
  `unique` en base, dédup côté serveur phase 04).

## 2. Règles financières (zone critique)

- Montants en **F CFA entiers** (XOF, sans sous-unité), même unité en base (`bigint`), dans IndexedDB et dans la synchro : aucune conversion. `parseFcfa`, `formatFcfa`,
  `lineTotal`, `sumAmounts` (`src/domain/money.ts`). Jamais de float.
- `paymentBalance(orderTotal, payments)` :
  - `total_paid` = somme des paiements `VALID` (chaque montant vérifié sûr) ;
  - `remaining = max(total - total_paid, 0)`, `surplus = max(total_paid - total, 0)` ;
  - **scénario canonique testé** : total 50 000 ; +20 000 → reste 30 000 ; +15 000 → reste
    15 000 ; +20 000 → surplus 5 000 ; annulation du dernier → retour à reste 15 000.
- **Blocages** : montant ≤ 0 refusé ; encaissement sur commande `CANCELLED` refusé ;
  annulation d'un paiement déjà `CANCELLED` refusée ; raison d'annulation vide refusée.
- **Aucune modification silencieuse** : un paiement ne change d'état que via l'annulation
  journalisée (INSERT puis UPDATE du statut, deux opérations locales distinctes en file).

## 3. Architecture

```
src/domain/orders/payments.ts            modes, statuts, validation, solde, annulations
src/repository/ports/payments.ts         contrat PaymentsRepository
src/repository/local/payments.ts         implémentation IndexedDB (entité payments)
src/application/orders/paymentService.ts cas d'usage : recordPayment, cancelPayment, orderPayments
src/features/orders/facade.ts            expose orders + payments (même moteur de sync)
src/features/orders/PaymentsPanel.tsx    encaisser / annuler / solde (fiche commande)
src/features/orders/OrderDetail.tsx      intègre PaymentsPanel
```

Miroir du schéma `0002_finance.sql` (`payments`). L'entité est **financial** : en base,
pas de mise à jour silencieuse ; le serveur applique les opérations dans leur ordre
chronologique et déduplique par `idempotency_key`.

## 4. UI

Panneau « Paiements » dans la fiche commande : Total / Payé / Reste à payer / Surplus,
liste des paiements (badge Validé/Annulé + raison), bouton « Encaisser » (montant en F CFA,
mode, note), bouton « Annuler » par paiement (raison obligatoire). Bloqué sur une commande
`CANCELLED` (lecture seule).

## 5. Tests

`tests/unit/orders/payments.test.ts` — validation (montant/mode/commande), solde re-calculé
(scénario canonique, ordre chronologique, débordement), annulation douce.
`tests/integration/orders/paymentService.test.ts` — encaissements successifs + surplus +
annulation du dernier avec retour au solde exact, raisons obligatoires, commande annulée
bloquée, solde depuis l'historique, flush idempotent avec opérations uniques et UPDATE
annulation visible.

## 6. À faire (phases avancées / provisionnement)

- **Reçus (Prompt 16)** : références `REC-YYYY-XXXXXX` sur l'état validé au moment de
  l'émission ; reçu immuable + contre-avoir pour corrections.
- Rapprochement du solde à la livraison (`DELIVERED`) et re-calcul serveur (job) phase 04.
- Float de caisse / relevé quotidien (Prompt 20, tableau de bord).
## Soldes à encaisser et relance WhatsApp (2026-10-18)

**Le problème** : l'argent qui reste dû est éparpillé dans les fiches commande. Pour savoir
qui doit encore payer, il fallait ouvrir chaque commande, puis écrire soi-même le message de
rappel — difficile pour quelqu'un qui lit mal, et l'argent des habits déjà prêts dort.

**Écran `/soldes`** (menu « Soldes », tuile « Reste à encaisser » du tableau de bord)
- En haut : le total à encaisser en grand, le nombre de clients et ceux à encaisser
  **maintenant** ; le haut-parleur lit le total à voix haute.
- Deux choix : **Maintenant** (un habit est prêt ou déjà remis : l'argent est dû) et
  **Tous** (acomptes en cours compris). Sans choix, l'écran ouvre « Maintenant » s'il y a
  quelqu'un, sinon « Tous » — jamais une liste vide par défaut.
- Une carte par client : initiales, nom et numéro, **« Reste »** en grand, jusqu'à 3
  commandes avec l'image de l'étape (Reçue, En couture, Prête, Livrée), l'habit et le
  montant restant. Trois gros boutons : **Relancer** (WhatsApp), **Encaisser** (ouvre la
  commande au plus gros reste, `/commandes?commande=<id>`, d'où l'on encaisse comme
  d'habitude), **haut-parleur** (lit le client, ce qu'il doit et ses habits).
- **Relancer** ouvre le message prêt, modifiable, avec le numéro WhatsApp du client
  (modifiable aussi), « Écouter le message », « Copier » et le bouton principal **« Envoyer
  sur WhatsApp »** : WhatsApp s'ouvre sur la conversation, il ne reste qu'à appuyer sur
  Envoyer. La carte affiche ensuite « Relancé aujourd'hui (sur ce téléphone) ».

**Règles et pourquoi**
- Calcul sur l'appareil, à partir des commandes et paiements déjà synchronisés
  (`src/domain/orders/debts.ts`) : commandes ni annulées ni supprimées, reste > 0
  (même calcul que le panneau Paiements, `paymentBalance` — les paiements annulés ne
  comptent pas). Ordre : dû maintenant d'abord, puis le plus gros montant, puis le plus
  ancien.
- Le message dépend de la situation : habit prêt (« bonne nouvelle… passez le récupérer »),
  déjà remis (« petit rappel… »), encore en couture (« il restera … à la livraison »). Il ne
  parle que des habits concernés (un habit prêt n'est pas confondu avec celui en couture) ;
  le montant est tout ce qui reste à payer.
- Droits : il faut `payments.read` et `orders.read` (sinon l'écran l'explique). Le menu
  « Soldes » n'apparaît qu'avec `payments.read`.
- **Aucune migration, aucune table** : l'envoi passe par le lien `wa.me` (comme les rappels
  de rendez-vous). Rien n'est envoyé sans que la personne appuie sur Envoyer dans WhatsApp.
- **Limite connue** : la mention « Relancé … » est gardée sur l'appareil seulement
  (`src/infrastructure/debts/reminderLog.ts`, stockage local) ; un autre téléphone de
  l'équipe ne la voit pas. La partager demanderait une table (migration) — à faire si le
  besoin se confirme.

**Tests** : `tests/unit/orders/debts.test.ts` (reste à payer, paiements annulés, commandes
annulées/supprimées exclues, ordre, regroupement par client, messages selon l'étape, habit
prêt à côté d'un habit en couture), `tests/unit/assistant/assistant.test.ts` (l'aide répond
à « relancer un client »). Navigateur à 375 et 1366 px : filtre, message, ouverture de
WhatsApp, mention « Relancé aujourd'hui », lien Encaisser vers la commande.

**À faire par le propriétaire** : rien. Le menu « Soldes » apparaît après la mise à jour de
l'application.
