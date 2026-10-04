# Rapport mensuel

Page `/rapports` (menu « Rapports », permission `reports.read`). Calculé sur l'appareil à
partir des données synchronisées : aucun envoi, fonctionne hors connexion.

- Mois au choix (24 derniers), flèches précédent / suivant.
- Encaissé (avec évolution vs mois précédent), facturé, reste à encaisser sur les commandes
  du mois, commandes livrées / annulées, encaissements jour par jour, meilleurs clients,
  répartition par moyen de paiement, nouveaux clients, reste à encaisser global.
- « Exporter pour Excel » : CSV UTF-8 avec BOM, séparateur « ; », lignes Windows ; résumé
  puis détail de chaque paiement du mois. Les textes commençant par `= + - @` sont
  neutralisés (pas de formule injectée).

Code : `src/domain/reports/monthly.ts`, `src/features/reports/ReportsView.tsx`.
Tests : `tests/unit/reports/monthly.test.ts`.
