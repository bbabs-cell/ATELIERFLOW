# RECEIPTS.md — Reçus & contre-avoirs (Prompt 16)

Date : 2026-10-02 — Reçus professionnels immuables, émis sur l'état financier validé ; PDF, impression et partage.
Vérifié : typecheck, lint, build prod, 266 tests verts ; parcours navigateur (émission, aperçu, PDF, impression A5, WhatsApp, contre-avoir, mobile 390 px).

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

## 4. Document, PDF, impression, partage

Un **modèle unique** (`buildReceiptDocument`, `src/domain/orders/receiptDocument.ts`) alimente
l'aperçu à l'écran (`ReceiptSheet`), l'impression et le PDF : les trois affichent exactement
les mêmes valeurs. Les sommes viennent **du reçu émis** (montant + état figé, confirmés par le
serveur après synchronisation), jamais des paiements actuels.

Contenu : atelier (nom, téléphone, adresse, mention de pied), client (nom, téléphone),
commande (référence, articles non supprimés), paiement (montant, mode, note ; motif
d'annulation pour un contre-avoir), total, déjà payé, reste à payer / surplus / soldé, date
d'émission (fuseau de l'appareil), référence, montant en toutes lettres
(`src/domain/moneyWords.ts` : « vingt mille francs CFA »).

- **PDF** : `src/infrastructure/receipts/receiptPdf.ts` (pdf-lib, A5 portrait, couleurs du
  Design System, polices PDF standard WinAnsi — caractères hors latin remplacés par « ? »).
  Généré dans le navigateur, sans service tiers ; module chargé à la demande et préchargé à
  l'ouverture du reçu pour fonctionner ensuite hors connexion. Fichier
  `Recu-REC-….pdf` / `Contre-avoir-REC-….pdf`.
- **Impression** : `window.print()` ; la feuille rendue dans `#receipt-print-root` est seule
  imprimée (`@page A5`, `globals.css`).
- **Partage** : « Partager le PDF » (Web Share avec fichier, mobile) ; « WhatsApp » ouvre
  `wa.me/<numéro>` si le téléphone du client est au format international (+221…, 00221…),
  sinon le partage libre, avec un message récapitulatif (montant, solde, atelier).
- **Référence provisoire** : tant que l'opération d'émission attend le serveur
  (`SyncEngine.isSettled`), le reçu porte « Référence provisoire » — le serveur attribue la
  référence définitive (`next_reference_sequence`) et l'état recalculé, qui remplacent la
  copie locale à la synchronisation. En mode démo (sans serveur), la référence locale fait foi.

## 5. Coordonnées de l'atelier

`tenants.name` + `tenants.settings.receipt { phone, address, footer }`
(`src/domain/tenant/identity.ts`, `src/infrastructure/tenant/atelierIdentity.ts`). Lecture
par tout membre (RLS `tenants_select_member_or_admin`), copie gardée sur l'appareil pour les
reçus hors ligne ; modification depuis le reçu (« Coordonnées de l'atelier ») par qui a
`tenant.settings` (propriétaire) — relecture puis fusion : les autres clés de `settings` sont
conservées. Aucune migration nécessaire.

## 6. UI

Dans la fiche commande, sous les paiements : chaque paiement validé propose **Reçu**,
chaque paiement annulé propose **Contre-avoir** (désactivés une fois émis) ; le reçu émis
s'ouvre aussitôt. La liste des reçus affiche référence, badge, mode, montant, date et
**Voir**.

## 7. Tests

`tests/unit/orders/receipts.test.ts` — références, séquence, état figé, natures.
`tests/integration/orders/receiptService.test.ts` — émission cohérente avec le solde,
séquence, doublons refusés, état avant/après annulation, immuabilité, flush idempotent,
`receiptSources` (provisoire puis confirmé après synchronisation).
`tests/unit/receipts/*` — montant en lettres (accords : quatre-vingts, deux cents, mille,
millions), document (valeurs figées, lignes, surplus/soldé, contre-avoir, partage
WhatsApp), coordonnées (lecture tolérante, validation, fusion), PDF (A5, une page,
métadonnées, contenu : référence, client, montants, mode, cas limites : 25 articles,
caractères non latins, contre-avoir provisoire).

## 8. Reste

- Archivage du PDF dans Cloudflare R2 (`pdf_key`, étape 05).
- Rappels / envois automatiques WhatsApp (étape 17).
