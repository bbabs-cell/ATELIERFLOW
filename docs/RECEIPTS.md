# RECEIPTS.md — Reçus & contre-avoirs (Prompt 16)

Date : 2026-09-25 — Reçus professionnels immuables, émis sur l'état financier validé.
Vérifié : typecheck, lint, build prod, 104 tests verts (dont 10 nouveaux pour les reçus).

## 1. Portée

- **Reçu** émis pour un paiement **validé** : référence `REC-YYYY-XXXXXX`, montant, mode,
  état financier figé au moment de l'émission (total, payé, reste, surplus).
- **Contre-avoir** (reçu de correction) émis pour un paiement **annulé** : même référence
  séquentielle, `is_correction = true`, état figé **après** annulation.
- **Immuabilité** : un reçu émis n'est jamais modifié ni supprimé (miroir du trigger
  `receipts_no_edit` de `0002_finance.sql` ; le repo local refuse tout `saveReceipt`
  sur un id existant → `RECEIPT_IMMUTABLE`).
- Un seul reçu de chaque nature par paiement (pas de double émission).
- `pdf_key` en attente du stockage R2 (Prompt 18 / phase 04).

## 2. Règles

- Les références suivent la convention `REC-YYYY-XXXXXX`, séquence par tenant **et par
  année**, dérivée de `nextReceiptSequence` (même logique que `ORD-…`).
- L'état figé (`ReceiptState { total, totalPaid, remaining, surplus }`) est re-calculé
  à l'émission à partir des paiements `VALID` — jamais stocké ni deviné.
- Scénario testé : total 50 000, paiements 20 000 + 15 000 + 20 000 → reçu sur le dernier
  avec `surplus: 5000` ; annulation de ce paiement + contre-avoir → l'état du contre-avoir
  reflète `remaining: 15000` (retour au solde exact).
- Après la correction, aucun document n'est amendé : on émet un contre-avoir.

## 3. Architecture

```
src/domain/orders/receipts.ts            références REC, état figé, buildReceipt
src/repository/ports/receipts.ts         contrat ReceiptsRepository (insert uniquement)
src/repository/local/receipts.ts         IndexedDB, garde d'immuabilité locale
src/application/orders/receiptService.ts issuePaymentReceipt / issueCorrectionReceipt / orderReceipts
src/features/orders/facade.ts            expose orders + payments + receipts
src/features/orders/PaymentsPanel.tsx    boutons Reçu / Contre-avoir + liste des reçus (fiche commande)
```

## 4. UI

Dans la fiche commande, sous les paiements : chaque paiement validé propose **Reçu**,
chaque paiement annulé propose **Contre-avoir** (désactivés une fois émis). La liste des
reçus affiche référence, badge Reçu/Contre-avoir, mode, montant et date.

## 5. Tests

`tests/unit/orders/receipts.test.ts` — format/validation des références, séquence déduite
par année, construction avec état figé, refus montant négatif/référence invalide, natures
Reçu vs Contre-avoir.
`tests/integration/orders/receiptService.test.ts` — émission cohérente avec le solde,
séquence croissante, doublons refusés, état emprisonné avant/après annulation (scénario
canonique), immuabilité locale (`RECEIPT_IMMUTABLE`), flush idempotent (INSERT unique).

## 6. À faire (phases avancées / provisionnement)

- Téléchargement PDF / impression : génération du PDF et `pdf_key` R2 (Prompt 18), envoi
  WhatsApp (Prompt 17) du reçu au client.
- Re-calcul/contrôle serveur du numéro de séquence (contrainte `unique (tenant_id, reference)`
  + dedupe `idempotency_key`) phase 04.