# STOCK.md — Tissus & mouvements de stock (Prompt 18)

Date : 2026-09-25 — Référentiel des tissus et journal traçable des mouvements.
Vérifié : typecheck, lint, build prod, 137 tests verts (dont 16 pour le stock).

## 1. Portée

- **Tissus** (`fabrics`) : nom, couleur, fournisseur, **quantité**, unité (`m`), prix au
  mètre (centimes), statut `ACTIVE`/`ARCHIVED`. `photo_key` en attente de R2 (phase 05).
- **Mouvements** (`stock_movements`) : journal **immuable en pratique** (INSERT seul),
  types `IN` (entrée), `OUT` (sortie), `ADJUST` (mise à blanc/ajustement), signé,
  `balance_after` recalculé à chaque opération, raison et auteur.
- **Stock initial** : un tissu peut être créé avec un stock de départ — cela écrit un
  mouvement d'ouverture `ADJUST` « Stock initial » (audit dès la première ligne).
- **Archivage doux** : jamais de suppression ; un tissu archivé est exclu des listes par
  défaut mais son journal reste lisible.
- Intégration avec les commandes (`fabric_id`, `fabric_meters` sur `order_items`) :
  réservée à une vraie vente/débit unitaire (hors périmètre, phase 21+).

## 2. Règles

- **Arithmétique exacte** : quantités en **centi-unités** (12,50 m = `1250`), comme les
  centimes pour l'argent — aucun float. `parseCentiUnits`/`formatCentiUnits` (`units.ts`).
- **Garde d'intégrité** : une sortie (`OUT`) qui ferait passer le stock sous zéro est
  **refusée** (`Stock insuffisant pour cette sortie.`). `ADJUST` impose une cible non
  négative (delta signé = cible − courant, zéro autorisé pour la perte totale).
- **Ledger** : chaque opération écrit exactement un `stock_movements` (INSERT) et met à
  jour la fiche tissu (UPDATE) ; les deux sont poussés en sync avec des clés d'idempotence
  distinctes — flush rejoué = aucun doublon (testé).
- Validation : nom requis, prix/longueur parsés strictement (virgule ou point, 2
  décimales max), type de mouvement connu, quantité d'entrée/sortie > 0.

## 3. Architecture

```
src/domain/inventory/units.ts        centi-unités exactes (parse/format)
src/domain/inventory/fabrics.ts      fiche tissu + validation + prix/m de départ
src/domain/inventory/stock.ts        mouvements : deltas signés, gardes, cible ADJUST
src/repository/ports/inventory.ts    contrats fabrics + stock_movements
src/repository/local/inventory.ts    IndexedDB (entités fabrics, stock_movements)
src/application/stock/stockService.ts création, mouvements, archivage, listes, journal
src/features/stock/constants.ts      métadonnées UI
src/features/stock/facade.ts         partage l'engine de sync (clients)
src/features/stock/FabricForm.tsx + StockView.tsx
src/app/stock/page.tsx               prérendue (statique)
```

## 4. UI (`/stock`)

Recherche instantanée (nom/couleur/fournisseur), bascule « afficher les archivés »,
alarme **Stock bas** (≤ 1 m) et alertes de stock négatif. Par tissu : badge statut, prix
au mètre, boutons **Entrée / Sortie / Ajuster** (dialogue avec type, longueur et raison)
et **Archiver**. Tiroir de détail : fiche complète + **journal des mouvements**
(delta ± m coloré, solde après, raison, horodatage).

## 5. Tests

`tests/unit/inventory/stock.test.ts` — parse/format centi, validations fiche tissu,
validations mouvement, `applyStockDelta` (IN/OUT/ADJUST cible + garde négativité).
`tests/integration/stock/stockService.test.ts` — création avec stock initial + mouvement
d'ouverture, enchaînement entrées/sorties (soldes exacts), sortie excessive refusée,
ajustement à cible + mise à blanc, archivage (pas de redouble, exclusion par défaut),
recherche, mouvement sur tissu inconnu, **flush idempotent** (1 INSERT fiche + 1 INSERT
mouvement, UPDATE seul pour la fiche ensuite).

## 6. À faire (phases avancées / provisionnement)

- `photo_key` des tissus → stockage R2 (phase 05) et photo dans la fiche UI.
- Débit automatique du stock à la validation de commande (`order_items.fabric_meters`)
  via transactions serveur + trigger serveur, races de concurrence (locks).
- RLS `0008` : politiques `fabrics_*` et `stock_movements_*`
  (`has_permission('fabrics.*')`, `has_permission('stock.*')`).
- Entitlements : `fabrics.read/write` et `stock.read/write` seulement si la formule le
  permet (`0005_subscriptions`).