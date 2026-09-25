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

- Montants en **entiers** (`bigint` côté serveur, centimes côté client) ; `parseEurosToCentimes`,
  `lineTotal`, `sumCentimes` déjà en place (Prompt 14). Jamais de float.
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
liste des paiements (badge Validé/Annulé + raison), bouton « Encaisser » (montant en €,
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