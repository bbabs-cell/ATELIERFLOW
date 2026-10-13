---
name: methode-magyapro
description: "La méthode de travail éprouvée sur MagyaPro (SaaS multi-commerçant Next.js + Prisma + Tailwind, utilisé au téléphone en Afrique de l'Ouest) — design system à jetons, mobile d'abord, vitesse sur réseau faible, architecture des routes et des services, sécurité multi-tenant, tests et livraison par PR. À utiliser dès qu'on construit, conçoit, refond, audite ou corrige une fonctionnalité sur Atelier Flow ou tout autre produit du même propriétaire : nouvelle page de tableau de bord, route d'API, modèle Prisma, écran mobile, bouton, tableau, envoi de photo, notification, rappel planifié, contrôle d'accès, revue de sécurité ou de performance — même si l'utilisateur ne cite pas « MagyaPro » ni « la méthode »."
---

# La méthode MagyaPro

Ce skill condense ce qui a été appris en construisant MagyaPro : les règles
qui ont tenu, et surtout **pourquoi** elles existent — presque chacune est née
d'un bug réel en production. Sur un autre projet (Atelier Flow), reprends les
principes et adapte les noms ; ne copie pas un détail qui ne correspond à
rien dans le nouveau code.

## Le contexte qui explique tout

Les utilisateurs sont des commerçants et artisans qui travaillent **au
téléphone**, souvent en plein soleil, sur un réseau 3G instable avec un forfait
compté, parfois sur un appareil d'entrée de gamme. Ils ne lisent pas de
documentation. Chaque décision en découle :

- l'écran de 375 px est l'écran principal, pas une déclinaison ;
- chaque mégaoctet coûte de l'argent et des secondes ;
- un texte doit se lire en plein soleil (contraste ≥ 4,5:1) ;
- l'interface est **en français** simple, ton direct, sans jargon technique ;
- une action ratée doit le dire clairement et ne rien laisser à moitié fait.

## Avant de coder : repérer le socle existant

Sur un dépôt qu'on découvre, cherche d'abord les équivalents de ces briques —
elles existent souvent sous un autre nom. Si une brique manque, crée-la une
fois plutôt que de répéter le code dans chaque route :

| Brique | Rôle | Référence |
|---|---|---|
| Jetons de couleur en variables CSS | thème, marque par produit, mode sombre | `references/design.md` |
| `route()` + erreurs typées | conversion HTTP unique, contrôle d'origine | `references/architecture.md` |
| `requireX(permission)` | session + tenant + droit, en une ligne | `references/architecture.md` |
| Services `*-service.ts` | logique métier testable sans HTTP | `references/architecture.md` |
| `recordAudit`, `createNotification` | journal et alertes (+ web push) | `references/architecture.md` |
| `hit(clé, RATE_LIMITS.x)` | limitation de débit | `references/securite.md` |
| `.table-stack`, `BottomNav` | tableaux et navigation sur mobile | `references/mobile-vitesse.md` |
| `downscaleImage`, `optimizedImageProps` | photos légères | `references/mobile-vitesse.md` |

Des gabarits prêts à adapter sont dans `assets/` (voir la liste en bas).

## Les règles qui ne se négocient pas

1. **Un seul bouton principal par écran.** La couleur de marque sur un fond
   plein désigne *l'*action attendue. Deux boutons de marque s'annulent. Les
   autres actions sont secondaires (bordure, fond neutre) ou des liens.
2. **Aucune couleur écrite en dur dans un composant.** Tout passe par les
   jetons (`ink`, `surface`, `brand`, `state-*`). C'est ce qui permet d'avoir
   deux produits aux identités différentes, un mode sombre et un mode
   impression sur une seule base de code.
3. **Rien ne déborde à 375 px.** Pas de défilement horizontal, pas de bouton
   écrasé dont le texte se casse lettre par lettre. Vérifie-le avec
   `scripts/audit-debordement.mjs` avant de dire « c'est fait ».
4. **Toute écriture passe par un service, dans une transaction quand il y a
   plusieurs tables, avec une mise à jour conditionnelle** quand deux
   personnes peuvent agir en même temps (deux caisses, deux validations).
5. **Tout identifiant venu du client est re-filtré par le tenant courant.**
   `where: { id, storeId: context.store.id }` — jamais `where: { id }` seul.
   Une ressource d'un autre tenant répond « introuvable », pas « interdit ».
6. **Éviter une migration quand on peut dériver.** Une référence courte se
   calcule depuis l'id ; un rappel « une seule fois » se fait avec une fenêtre
   de temps ou une colonne de date réutilisée. Une migration coûte une
   opération manuelle en production — on la garde pour un vrai besoin.
7. **Le commentaire explique le pourquoi, en français, avec le cas réel.**
   « Sur une fenêtre courte, le menu passait sous la barre du bas » vaut mieux
   que « ajuste la hauteur ». C'est ce qui empêche le prochain de « nettoyer »
   une ligne qui corrigeait un vrai bug.
8. **Une fonctionnalité = des tests sur le service + une doc `docs/X.md` +
   une vérification visuelle sur mobile.** Puis une PR, fusionnée seulement
   quand la CI est verte.

## Déroulé d'une fonctionnalité

1. **Comprendre** : lire les fichiers voisins, repérer la brique existante la
   plus proche, la réutiliser. Lister ce que la fonctionnalité touche (stock ?
   argent ? droits ? notifications ?).
2. **Modèle** : peut-on éviter la migration (règle 6) ? Sinon, une migration
   petite, nommée, additive (colonnes nullables ou avec défaut).
3. **Service** (`src/lib/<domaine>/<sujet>-service.ts`) : fonctions qui
   prennent `{ tenantId, userId, userEmail, ...entrée }`, lèvent des erreurs
   typées avec un message français affichable tel quel, écrivent l'audit et
   la notification.
4. **Route** : `route()` → `requireX(permission)` → `hit()` → `parseOrThrow`
   (Zod) → service → `ok(data, 201)`. Rien d'autre dans la route.
5. **Page serveur** : `requireX('…:view')`, chargements en `Promise.all`,
   droits calculés côté serveur et passés en props booléennes (`canSend`).
6. **Composant client** : jetons, un seul bouton principal, `table-stack`,
   états vide / chargement / erreur, `startTransition(() => router.refresh())`
   après une écriture, brouillon en `localStorage` pour les saisies longues.
7. **Tests** (Vitest, vraie base Postgres) : appeler le service directement ;
   tester le cas nominal, la double action (rejouer = refus), le tenant
   étranger (= introuvable), le droit insuffisant, et le « n'écrit rien en
   cas d'échec ».
8. **Vérifier** : `typecheck`, `lint`, `test`, `build`, puis capture
   Playwright à 375 px et audit de débordement. Voir
   `references/processus.md`.
9. **Documenter** : `docs/SUJET.md` — ce que ça fait, pour qui, les choix et
   leurs raisons, ce qui reste à faire côté propriétaire (variable
   d'environnement, SQL à lancer, réglage à remplir).
10. **Livrer** : commit clair en français, PR, CI verte, fusion.

## Où lire la suite

- `references/design.md` — palette, jetons, `themed()`, double identité,
  typographie, ombres, mouvement, boutons, cartes, états vides. À lire avant
  tout travail d'interface.
- `references/mobile-vitesse.md` — barre de navigation basse, tableaux en
  fiches, 2×2, audit à 375 px, images, chargement, hors-ligne, brouillons.
  À lire pour toute page ou tout envoi de fichier.
- `references/architecture.md` — `route()`, erreurs, RBAC, services,
  transactions, stock/argent atomiques, audit, notifications et push, tâches
  planifiées, rappels sans migration. À lire avant toute route ou tout modèle.
- `references/securite.md` — IP client, contrôle d'origine, isolement des
  tenants, limites de débit, envois de fichiers, liste blanche, secrets.
  À lire pour toute route d'écriture ou toute revue.
- `references/processus.md` — tests, vérification navigateur, contrôle en
  production, branches et PR, documentation, migrations manuelles.

## Gabarits (`assets/`)

- `tailwind-themed.ts` — la fonction `themed()` (Tailwind 3) et son
  équivalent Tailwind 4 ;
- `jetons.css` — déclaration des variables (clair, sombre, seconde identité,
  impression, mouvement réduit) ;
- `table-stack.css` — tableaux en fiches sous 768 px ;
- `api.ts` — `route()`, `ok`/`fail`, erreurs typées, contrôle d'origine ;
- `route-exemple.ts` et `service-exemple.ts` — la forme d'une écriture ;
- `optimized-image.ts` et `downscale-image.ts` — images légères.

Script : `scripts/audit-debordement.mjs` — parcourt des pages à 375 px avec
Playwright et signale débordements horizontaux et boutons écrasés.
