# DASHBOARD & RECHERCHE (Prompt 20)

Tableau de bord (KPIs de l'atelier) et recherche globale multi-entités.
Lecture seule : aucune mutation. Les calculs sont purs (`src/domain/dashboard`),
le service orchestre les référentiels locaux, la UI affiche.

## KPIs

`aggregateDashboardKpis(input)` → `DashboardKpis` :

| Bloc | Contenu |
|---|---|
| `money` | encaissé période (paiements VALID), facturé période (commandes créées), reste à encaisser (total − payé, hors annulées), commandes actives, à retirer, en retard (échéance passée, non livrée) |
| `context` | clients actifs / nouveaux, RDV du jour, tissus en stock bas (≤ 1 m), stock total, sorties période, équipe active |
| `revenue` | 7 points de série temporelle sur la période |
| `ordersByStatus` / `appointmentsByType` / `paymentsByMethod` | répartitions exactes |

- Arithmétique stricte en **F CFA entiers** (jamais de float) via les sommes
  de `sumCentimes` ; le reste à encaisser n'est jamais négatif par commande.
- Les paiements `CANCELLED` sont exclus des encaissements.
- `defaultDateRange(now)` (1 mois) et `dayDateRange(days, now)` fournissent
  la fenêtre ; la UI propose 7 / 30 / 90 jours.

## Recherche

`search(term)` normalise la requête (minuscules, sans accents) et interroge :
clients (nom/tél/WhatsApp/email), commandes (référence/notes), tissus
(nom/couleur/fournisseur), rendez-vous (client), membres (nom/tél).
Chaque entité n'est interrogée que si la permission de lecture correspondante
est accordée (`customers.read`, `orders.read`, « fabrics.read » ,
`appointments.read`, `team.read`) et les résultats sont limités (max 12).

## Permissions

`getAccess()` calcule les permissions de l'opérateur depuis `PERMISSIONS_BY_ROLE`
(jamais stockées) :
- **KPIs** : exigent `reports.read` (OWNER, MANAGER, EMPLOYEE) — sinon
  `{ ok: false, reason: "FORBIDDEN" }` (APPRENTICE).
- **Recherche** : scopée par entité selon les permissions de lecture
  (un APPRENTICE ne voit pas l'équipe).

## Interface

`src/app/dashboard/page.tsx` (prérendu) → `src/features/dashboard/DashboardView.tsx` :

- sélecteur de période (7/30/90 j), cartes KPI, histogramme d'encaissements
  (SVG léger, sans lib externe), répartition par moyen de paiement, commandes
  par statut, rendez-vous par type, bloc atelier ;
- recherche globale avec résultats groupés par entité et liens vers
  `/clients`, `/commandes`, `/stock`, `/rdv`, `/equipe` ;
- états chargement / erreur / accès refusé.

## Fichiers

| Fichier | Rôle |
|---|---|
| `src/domain/dashboard/kpis.ts` | agrégations pures + fenêtres de dates |
| `src/domain/dashboard/search.ts` | normalisation et builders de résultats |
| `src/application/dashboard/dashboardService.ts` | orchestration + permissions |
| `src/features/dashboard/*` | facade + UI + constantes |
| `src/repository/ports/payments.ts` | ajout `listAll()` (agrégats globaux) |
| `src/app/dashboard/page.tsx` | route `/dashboard` |

## Tests

- `tests/unit/dashboard/kpis.test.ts` — agrégats, buckets temporels, seuils.
- `tests/integration/dashboard/dashboardService.test.ts` — KPIs réels, refus
  APPRENTICE (`reports.read`), recherche scopée par permissions, recherche
  vide.

Total suite : **160 tests**, typecheck/eslint/build verts.