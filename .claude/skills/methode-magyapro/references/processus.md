# Processus — tests, vérification, livraison

Sommaire : 1. Tests · 2. Vérifications avant de livrer · 3. Vérification dans
le navigateur · 4. Vérification en production · 5. Git et PR ·
6. Documentation · 7. Ce que le propriétaire doit faire · 8. Pannes connues
de l'environnement

## 1. Tests

- **Vitest contre une vraie base Postgres** (`TEST_DATABASE_URL`), pas de
  simulation de Prisma : les bugs de transaction, de contrainte et de
  concurrence ne se voient qu'avec une vraie base.
- Aides partagées dans `tests/helpers.ts` : `resetDatabase()`,
  `createTestStore({ name, initialStock, … })` → `{ store, owner, warehouse,
  variant }`, `addStoreMember(storeId, role)`.
- On appelle les **services directement** ; les routes sont fines et couvertes
  par la sonde HTTP.
- Fonctions pures testées à part, sans base (formats, calculs, encodage).
- Cas à couvrir pour toute écriture :
  1. le cas nominal et ses effets (stock, mouvement tracé, notification) ;
  2. rejouer l'action → refusée (« déjà réceptionné ») ;
  3. un autre tenant → « introuvable » ;
  4. un droit insuffisant → refusé ;
  5. un échec → **rien n'est écrit** (compter les lignes avant/après) ;
  6. une tâche planifiée lancée deux fois → un seul envoi.
- Noms de tests en français, qui énoncent la règle métier :
  « un renouvellement payé en avance ne fait perdre aucun jour ».
- Pièges : espaces insécables dans les montants formatés (`/10\s000/`) ;
  dates relatives à `Date.now()` avec une marge ; `now` injectable dans les
  fonctions de cron.

## 2. Vérifications avant de livrer

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

Tout doit passer. Puis relire son propre diff en cherchant ce qui ferait
échouer la CI ou casserait un autre écran. Un échec préexistant (sans lien
avec le changement) est signalé, pas masqué.

## 3. Vérification dans le navigateur

Lancer l'app (`npm run dev` ou `next start` après build), se connecter avec
un compte de démonstration, puis avec Playwright (`playwright-core`,
Chromium en `/opt/pw-browsers/chromium` dans les sessions distantes) :

- capture à **375 × 812** (et 1280 pour le bureau) de chaque écran touché,
  **regardée** — pas seulement générée ;
- `scripts/audit-debordement.mjs` sur les pages touchées (ou toutes) ;
- dérouler le parcours réel : remplir, envoyer, voir le message, recharger.

Les captures d'écran envoyées par le propriétaire sont la meilleure source de
bugs : chercher la cause générale (la même cellule `Actions` est dans dix
tableaux), corriger partout, puis ajouter le contrôle à l'audit pour que ça ne
revienne pas.

## 4. Vérification en production

Après fusion et déploiement : `curl -sI https://www.<domaine>/<page>` (statut,
en-têtes, cache), poids réel des images (`curl -s -o /dev/null -w
'%{size_download}'`), une page publique et une route de santé. Dans les
sessions distantes, passer par `www.` si le domaine nu échoue au TLS du proxy.

## 5. Git et PR

- Une fonctionnalité = une branche de travail = une PR. Ne pas élargir une PR
  en cours avec un autre sujet.
- Commits en français, à l'impératif, qui disent le pourquoi :
  « Transferts de stock entre boutiques du même propriétaire ».
- Description de PR : ce que ça fait pour l'utilisateur, les choix et leurs
  raisons, comment c'est testé (nombre de tests), captures, et **ce que le
  propriétaire doit faire** (migration SQL, variable d'environnement).
- Fusion seulement quand la CI est verte (squash). Si l'aperçu Vercel échoue
  pour quota de déploiements (échec en 1 s, sans journal), le signaler sur la
  PR : ce n'est pas le code.
- Après une fusion squash, repartir de la branche de base à jour ; si le
  force-push est refusé, `git merge -s ours origin/<branche>` puis push normal.

## 6. Documentation

Une page `docs/SUJET.md` par fonctionnalité, en français :

1. Le problème, vu du commerçant (une ou deux phrases concrètes).
2. Ce que fait la fonctionnalité, écran par écran.
3. Les règles métier et **pourquoi** (ex. le stock quitte la boutique de départ
   à l'envoi, entre dans l'autre à la réception — pas avant).
4. Les choix techniques notables (fichiers, pas de migration et comment).
5. Limites connues et suites possibles.
6. Ce qui reste à faire côté propriétaire.

Plus deux documents de fond tenus à jour : `DESIGN.md` (système visuel, règles
nommées) et `docs/SECURITE.md` (audit, corrigé, à décider).

## 7. Ce que le propriétaire doit faire — toujours le dire

Le propriétaire n'est pas développeur et travaille souvent au téléphone. À la
fin de chaque livraison, lister clairement, en étapes courtes :

- le SQL de migration à lancer (dans l'éditeur SQL de l'hébergeur de base),
  copiable tel quel ;
- les variables d'environnement à ajouter (nom, valeur ou où la trouver) et le
  redéploiement nécessaire ;
- le réglage à remplir dans l'interface (ex. numéro Wave dans Réglages) ;
- le test à faire soi-même (imprimer un ticket, envoyer une photo).

## 8. Pannes connues de l'environnement de développement

- Postgres arrêté → `pg_ctlcluster 16 main start`.
- `.env` absent → copier `.env.example`.
- Client Prisma hors de l'app (moteur `client`) → il faut un adaptateur ;
  pour un contrôle ponctuel, passer par `psql`.
- Ne jamais committer de capture ou de fichier temporaire : les écrire dans un
  dossier de travail hors du dépôt.
