# Page vitrine (`/`)

Page publique pour les visiteurs, construite comme les vitrines MagyaPro :

1. **Promesse + preuve** côte à côte : « Coupez, cousez, encaissez. » et un
   vrai reçu d'atelier (acompte, reste à payer, `REC-…`).
2. Bandeau d'assurances (essai, sans carte, hors connexion, Wave / Orange Money).
3. Le problème (le cahier) et cinq réponses concrètes.
4. Comment ça fonctionne, en quatre étapes.
5. Trois choses qu'un cahier ne fera jamais, puis les fonctions par groupe.
6. Hors connexion.
7. **Tarifs en direct** : `public_plans()` (0024), lisible sans connexion ;
   ils suivent les prix fixés dans « Plateforme ».
8. Questions fréquentes, dernier appel, pied de page.

Règles : chaque fonction citée existe dans l'application (pas de promesse
non tenue) ; les boutons « Commencer » ouvrent `/connexion?inscription=1`
(onglet « Créer un compte ») ; une session déjà ouverte est envoyée sur
`/dashboard` ; l'application installée (PWA) démarre sur `/dashboard`.
Code : `src/features/vitrine/`.
