# AUDIT PERFORMANCE (Prompt 25)

Audit du 2026-10-03, refait sur le code actuel (synchronisation dans les deux
sens, abonnements, photos). Remplace le rapport du 2026-09-25, devenu faux sur
plusieurs points (routes `/api`, synchronisation toutes les 30 s).

Méthode : mesures, pas d'estimations. Build de production, jeux de données
réalistes (un atelier après quelques années), `EXPLAIN ANALYZE` sur
PostgreSQL 16 avec la vraie RLS, conseiller performance Supabase de la
production.

## Les vrais goulots — corrigés

| # | Goulot | Où | Avant | Après |
|---|---|---|---|---|
| G1 | **Page Commandes quadratique** : pour chaque commande, relecture de TOUS les articles et de TOUT l'historique | `orderService.listOrders` | 300 commandes : **7,2 s** · 1 500 : **163 s** | **27 ms** · **93 ms** |
| G2 | **Lecture locale non ciblée** : lire une entité (ex. paiements) désérialisait toute la base de l'appareil puis filtrait | `IndexedDbLocalCache.list` | ≈ 90 ms par lecture, quelle que soit l'entité | 2–16 ms (lecture de la seule tranche de clés `entité::`) |
| G3 | **RLS évaluée à chaque ligne** : `has_permission()` (fonction SECURITY DEFINER, non « inlinable ») rejouée pour chaque ligne lue | toutes les règles RLS métier | 20 000 commandes, page de 500 : **4,3 s** | **0,9 ms** |
| G4 | **Index manquants pour la synchronisation** : « ce qui a changé depuis… » trié par (curseur, id) sans index sur 7 tables + reçus | serveur | balayage de l'atelier + tri | parcours d'index, sans tri |

Mesures G1/G2 : Vitest + `fake-indexeddb` (plus lent qu'un vrai navigateur,
mais le rapport avant/après est le même). G3/G4 : PostgreSQL local,
`EXPLAIN ANALYZE`, rôle `authenticated`, claims réels.

G3 en pratique : un **nouvel appareil** (ou un téléphone réinstallé) d'un
atelier de 20 000 commandes attendait ≈ 40 pages × 4,3 s ≈ **3 minutes** pour
les seules commandes. La synchronisation incrémentale (toutes les 30 s) passe
de 18 ms à 1 ms par table.

## Ce qui a été changé

- `src/repository/local/indexeddb/cache.ts` + `db.ts` : `list(entité)` lit la
  plage de clés `IDBKeyRange.bound("entité::", "entité::￿")`. Mêmes
  résultats, même ordre.
- `src/application/orders/orderService.ts` + `src/repository/local/orders.ts`
  : `groupByOrder()` sur articles et historique — une lecture par type de
  données, regroupement en mémoire. Mêmes filtres et tris que `listByOrder`.
- `supabase/migrations/0023_performance.sql` :
  - 55 règles RLS réécrites avec `(select tenant_claim())`,
    `(select has_permission('…'))`, `(select auth.uid())`,
    `(select is_saas_admin())` → calculés **une fois par requête**.
    Vérifié automatiquement : une fois l'enveloppe retirée, les 59 règles sont
    **identiques au texte d'origine** ; les 31 attaques de
    `security_attacks_local.sql` restent refusées.
    `my_tenant_ids()` laissé tel quel (`= ANY ((select …))` changerait de
    sens) — utilisé seulement sur de petites tables.
  - Index `(tenant_id, updated_at, id)` : customers, measurement_profiles,
    fabrics, orders, order_items, payments, appointments ; receipts
    `(tenant_id, created_at, id)`.
  - Index des clés étrangères réellement interrogées : `receipts(payment_id,
    is_correction)` (dédoublonnage des reçus), `appointments(order_id)`,
    `stock_movements(order_item_id)`, `order_items(fabric_id)`.
  - Aucune donnée modifiée, migration rejouable.
- `supabase/validations/performance_local.sql` (dans `npm run test:db`) :
  aucune règle ne réévalue ces appels par ligne, index présents, plan de la
  requête de synchronisation sans tri.

Exactitude financière : aucun calcul d'argent touché. Sécurité : règles
identiques (preuve ci-dessus). Architecture : ports et adaptateurs inchangés
(une méthode ajoutée aux ports articles / historique).

## Vérifié, rien à corriger

| Domaine | Constat |
|---|---|
| Bundle | ≈ 225 Ko gzip par page, dont React/Next et Supabase (nécessaire à la connexion). Le code de l'application est léger. Les polyfills (38 Ko) ne sont chargés que par les vieux navigateurs (`noModule`). |
| PDF | `pdf-lib` (174 Ko gzip, la plus grosse librairie) est chargé **à la demande**, au moment d'imprimer un reçu — sur aucune page au départ. |
| Chargement initial | Toutes les pages prérendues statiques ; les données viennent d'IndexedDB après l'affichage. |
| Images | Photos réduites avant l'envoi (bord 1 600 px, JPEG 82 %), affichage `loading="lazy"`. Pas d'image matricielle dans l'interface (icônes SVG). |
| Polices | `next/font` auto-hébergées, sous-ensemble latin, `display: swap`. |
| Tableau de bord | Agrégats linéaires (une passe par type de données, `Map` par commande). |
| Recherche | Différée pendant la frappe, limitée à 12 résultats, filtrée par permissions. |
| Re-rendus | Session stable (même objet), écrans rechargés seulement si la synchronisation a réellement changé des données. |
| Hors ligne | Rien n'est tenté sans réseau ; file avec reprises espacées. |

## Restant, sans urgence

- **Premier chargement d'un très gros atelier** : `pullService` écrit chaque
  ligne dans sa propre transaction IndexedDB. Regrouper par page de 500
  accélérerait la toute première synchronisation d'un appareil ; sans effet
  sur l'usage courant (quelques lignes toutes les 30 s).
- **Clés étrangères « créé par »** (≈ 25 signalées par le conseiller
  Supabase) : ne servent qu'à la suppression d'un profil, qui n'existe pas
  dans l'application. Non indexées volontairement (chaque index ralentit les
  écritures).
- **Index jamais utilisés** (14 signalés) : la production a encore très peu de
  données, le constat n'est pas significatif. À revoir dans quelques mois,
  avant toute suppression.
