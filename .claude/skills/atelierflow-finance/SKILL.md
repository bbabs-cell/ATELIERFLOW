---
name: atelierflow-finance
description: Use when implementing or modifying payments, partial payments, surpluses, cancellation/refund, balances, quotes, receipts (REC-YYYY-XXXXXX), money math, or financial audit for the atelierflow SaaS. Also for writing financial tests. Trigger keywords: paiement, payment, solde, surplus, reste, remboursement, annulation, recu, receipt, money, bigint, idempotency.
---

# atelierflow-finance

Zone critique : exactitude, traçabilité, idempotence.

## Calculs canoniques (entiers, jamais float)

- `total_paid` = somme des paiements **valides** de la commande (statut != CANCELLED).
- `remaining = total - total_paid`
  - `remaining > 0` → "reste à payer"
  - `remaining < 0` → `surplus = abs(remaining)` (crédit à reporter, à utiliser ou rembourser, jamais détruit)
- Scénario obligatoire reproduit par les tests :
  - total 50 000 ; paiement 20 000 → reste 30 000
  - +15 000 → reste 15 000
  - +20 000 → surplus 5 000
  - annulation du dernier paiement (20 000) → **retour à reste 15 000** (les paiements plus anciens réappliqués dans l'ordre chronologique)

## Règles

- **Entiers** (`bigint`) pour tous montants. Pas de float, pas de JSON.parse arrondi.
- **Pas de suppression physique** d'un paiement. Annulation = statut `CANCELLED` + `cancelled_at`, `cancelled_by`, `reason` obligatoire.
- **Aucune modification silencieuse** : toute modification d'un paiement = nouvelle opération + trace d'audit.
- **Idempotence** : chaque paiement porte un `idempotency_key` unique (uuid). Appliquer deux fois le même push local ne doit jamais produire deux paiements (cf. offline-sync).
- **Re-calcul systématique** du solde à partir des paiements validés; ne jamais stocker un solde susceptible de devenir obsolète sans job de recalcul vérifié.
- **Traçabilité** : `payments` + `audit_log` + reçu lié à l'état exact validé. Rien n'est modifiable après émission d'un reçu lié — on émet un contre-avoir/document de correction.
- Modes : `CASH`, `ORANGE_MONEY`, `MOOV_MONEY`, `WAVE`, `TRANSFER`, `OTHER`.

## Reçus

- Format référence : `REC-YYYY-XXXXXX` (séquence par tenant + année).
- Le reçu reflète les données validées au moment de son émission (total, payé, reste/surplus, mode, date).

## Tests financiers exigés

1. paiement multiple (scénario canonique) ;
2. double synchronisation / double push (idempotence) ;
3. annulation du dernier paiement (retour au bon solde) ;
4. surpaiement et report du surplus ;
5. génération reçu cohérente avec le solde.