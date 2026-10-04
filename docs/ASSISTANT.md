# Assistant de l'atelier

Bulle « Assistant » en bas à droite de toutes les pages connectées.

## Principe

100 % local : les questions sont comprises sur l'appareil (mots-clés en français, sans
accents ni majuscules) et les réponses calculées à partir des données déjà présentes
sur l'appareil. Rien n'est envoyé à un service extérieur ; fonctionne hors connexion.
Ce n'est pas une IA générative : il reconnaît les questions courantes et propose des
suggestions quand il ne comprend pas.

## Ce qu'il sait faire

- **Données** (limitées aux droits du rôle) : commandes en cours, les plus urgentes
  (retard → échéance ≤ 3 jours → priorité), en retard, prêtes à retirer, qui doit de
  l'argent, encaissé (aujourd'hui, hier, semaine, mois, mois dernier, année), rendez-vous
  (aujourd'hui, demain, semaine…), clients, stock bas, résumé du jour, un client nommé
  (« Awa doit combien ? »), une commande (« ORD-2026-000012 »).
- **Aide** : 28 fiches (photo de profil, logo, mesures, commande, reçu, paiement,
  rendez-vous, équipe, stock, abonnement, monnaie, hors connexion, installation, mot de
  passe, rapport, modèles…) avec les noms exacts des boutons et un lien vers la page.

## Code

`src/domain/assistant/{text,help,assistant}.ts`, `src/features/assistant/AssistantWidget.tsx`,
données : `dashboardService.getAssistantSources()` (filtrées par permission).
Tests : `tests/unit/assistant/assistant.test.ts`.
