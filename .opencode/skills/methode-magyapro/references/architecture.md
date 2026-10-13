# Architecture — routes, services, données

Sommaire : 1. Pile · 2. Arborescence · 3. Routes d'API · 4. Erreurs typées ·
5. Contexte, tenant et droits · 6. Services et transactions · 7. Stock et
argent · 8. Audit · 9. Notifications · 10. Tâches planifiées et rappels ·
11. Éviter les migrations · 12. Pages serveur et composants client

## 1. Pile

Next.js 15 (App Router) + React 19, Prisma 6 sur Postgres, Tailwind, Zod,
Vitest. Hébergé sur Vercel (offre gratuite : quota de déploiements, crons
limités). Fichiers sur Cloudflare R2 via le SDK S3. Pas de dépendance ajoutée
sans raison forte — chaque bibliothèque est du poids envoyé à un téléphone ou
une surface d'attaque.

## 2. Arborescence

```
src/app/<produit>/dashboard/<page>/page.tsx   pages serveur
src/app/api/<produit>/<ressource>/route.ts    routes d'API (+ [id]/<action>/route.ts)
src/app/api/cron/<tâche>/route.ts             tâches planifiées
src/components/<produit>/<sujet>.tsx           composants client
src/components/ui/                             primitives partagées (PageHeader, BottomNav…)
src/lib/<produit>/<sujet>-service.ts           logique métier + écriture
src/lib/<produit>/<sujet>.ts                   fonctions pures (calculs, formats) — testées sans base
src/lib/client/                                code navigateur seulement
src/lib/api.ts, errors.ts, rbac.ts, audit.ts, notifications.ts, rate-limit.ts
docs/<SUJET>.md                                une doc par fonctionnalité
tests/<sujet>.test.ts
```

Séparer **calcul pur** (`stock-count.ts` : écart, résumé, libellé) et
**écriture** (`stock-count-service.ts`) : le pur se teste en millisecondes,
le service dans une vraie base.

## 3. Routes d'API

Toute route est enveloppée par `route()` (`assets/api.ts`). La forme est
toujours la même — si une route contient de la logique métier, elle est au
mauvais endroit :

```ts
export const POST = route(async (request) => {
  const context = await requireStore('inventory:transfer');   // session + tenant + droit
  await hit(`boutique-stock:${context.store.id}`, RATE_LIMITS.write);
  const input = parseOrThrow(schema, await readJson(request)); // Zod, erreurs par champ
  const result = await createTransfer({ storeId: context.store.id, userId: context.user.id,
                                        userEmail: context.user.email, ...input });
  return ok({ transfer: { id: result.id } }, 201);
});
```

- Réponse uniforme : `{ ok: true, data }` ou `{ ok: false, error: { code,
  message, fieldErrors? } }`. Le client n'a qu'une forme à lire.
- `route()` fait aussi le **contrôle d'origine** des écritures (voir
  `securite.md`) et convertit toute erreur ; une erreur inconnue devient un
  500 générique — aucune trace ni message Prisma ne sort.
- Schémas Zod stricts : longueurs max partout (`.max(64)` sur un id,
  `.max(300)` sur une note, `.max(500)` sur un tableau), nombres bornés,
  `.trim()` sur les textes. Messages d'erreur en français.
- Action sur une ressource = sous-route nommée en français :
  `transferts/[id]/reception`, `transferts/[id]/annulation`.
- Pages et routes en français dans l'URL (`/dashboard/inventaire`), code en
  anglais (`stock-count-service.ts`, `createTransfer`).

## 4. Erreurs typées

`AppError(message, status, code, fieldErrors?)` et ses filles :
`ValidationError` 400, `UnauthorizedError` 401, `ForbiddenError` 403,
`NotFoundError` 404, `ConflictError` 409, `RateLimitError` 429.

Le **message est destiné à l'utilisateur** : français, précis, actionnable.
Le service lève ; la route ne fait rien ; le composant affiche
`error.message`. Exemples réels : « Stock insuffisant pour Eau 1,5 L : 4
disponibles. », « Ce transfert a déjà été réceptionné. », « Une preuve a déjà
été déposée : la demande ne peut plus être annulée. »

## 5. Contexte, tenant et droits

- `requireStore(permission?)` (équivalent Atelier Flow : `requireAtelier`)
  résout session → tenant actif (cookie) → appartenance → permissions, et
  lève 401/403 sinon. Enveloppé dans `React.cache()`.
- **RBAC par permissions**, les rôles ne sont qu'un raccourci :
  `STORE_PERMISSIONS = ['inventory:view', 'inventory:manage',
  'inventory:transfer', …]`, puis `ROLE_PERMISSIONS: Record<Role,
  Set<Permission>>`. On teste toujours une permission, jamais un rôle. Chaque
  produit a son propre fichier RBAC : ils ne se contaminent pas.
- Mode « accès support » (l'équipe plateforme regarde un compte) : lecture
  seule — les écritures sont refusées (`!context.isSupportAccess`).
- Les droits sont calculés côté serveur et passés au composant en booléens
  (`canSend`, `canReceive`). Le composant masque ; **le serveur refuse**.

## 6. Services et transactions

```ts
export async function createTransfer(input: {
  storeId: string; userId: string; userEmail: string; /* + données validées */
}) {
  // 1. Relire tout ce qui vient du client, re-filtré par le tenant.
  // 2. Vérifier les règles métier → erreurs typées.
  // 3. Écrire dans prisma.$transaction(async (tx) => …) si plusieurs tables.
  // 4. Après la transaction : recordAudit + createNotification.
}
```

- Une seule transaction pour tout ce qui doit réussir ou échouer ensemble.
  Test systématique : « en cas d'échec, n'écrit rien ».
- **Mise à jour conditionnelle** contre la double action : `updateMany({
  where: { id, status: 'IN_TRANSIT' }, data: { status: 'RECEIVED' } })` puis
  `if (count === 0) throw new ConflictError('… déjà réceptionné.')`. Deux
  clics, deux onglets, deux personnes : un seul gagne.
- Les fonctions de service acceptent un `tx` optionnel
  (`tx: Prisma.TransactionClient | typeof prisma = prisma`) pour être
  composées dans une transaction plus large.
- Montants en entiers (francs CFA, pas de centimes) ou `Decimal` Prisma pour
  les quantités fractionnaires ; jamais de `float` pour de l'argent.

## 7. Stock et argent — un seul point d'entrée

Toute modification de stock passe par `recordStockMovement` — jamais
d'écriture directe sur la table d'inventaire. Il :

- écrit le mouvement typé (`SALE`, `PURCHASE`, `ADJUSTMENT`, `TRANSFER_OUT`,
  `TRANSFER_IN`, `RETURN`…) avec raison, auteur, référence (`referenceType`,
  `referenceId`) → historique complet et traçable ;
- fait une **mise à jour atomique conditionnelle** (`quantity >= sortie`),
  sauf si le tenant autorise le stock négatif (`allowNegativeStock`, passé par
  l'appelant pour éviter une requête) ;
- déclenche les alertes de stock faible, sauf `silent: true` (inventaire :
  l'équipe connaît déjà le résultat de son propre comptage).

Même principe pour l'argent (caisse, paiements, dettes) : une fonction
d'entrée, une ligne de journal par mouvement, jamais un solde modifié à la
main. Atelier Flow : appliquer à tout ce qui se compte (matières, heures,
commandes en cours).

Unités multiples (pièce / pack de 12) : stocker en **unité de base**,
convertir à l'affichage (diviser par le facteur) — erreur réelle : quantités
de pack affichées multipliées.

## 8. Audit

`recordAudit({ action: AUDIT_ACTIONS.X, actorUserId, actorEmail, storeId,
targetType, targetId, ip, metadata })` après chaque action sensible
(création, suppression, changement de droits, argent, réglages). Ne lève
jamais (un journal en panne ne bloque pas une vente). Métadonnées nettoyées
(pas de mot de passe ni jeton). Chaque nouvelle action reçoit un **libellé
français** dans `audit-labels.ts` — sinon l'écran du journal affiche
`stock.transfer.create` (oubli réel).

## 9. Notifications

`createNotification({ storeId | restaurantId, userId?, type, title, body,
href })` : ligne en base pour la cloche, puis web push hors du chemin de la
réponse (`after()`, avec repli direct hors requête : cron, tests). Jamais
deux tenants renseignés à la fois — lève une erreur de programmation.

Pour l'équipe plateforme : `createPlatformNotification` séparé.

## 10. Tâches planifiées et rappels

- Route `src/app/api/cron/<tâche>/route.ts`, protégée par secret partagé
  (`Authorization: Bearer ${CRON_SECRET}` sur Vercel), GET et POST acceptés.
  Sans secret configuré → refus, jamais ouverte.
- Vercel gratuit = peu de crons et une exécution par jour : regrouper les
  tâches de nuit dans une seule route.
- Chaque tâche est une fonction de service exportée, appelable et testable
  sans HTTP (`sendExpiringStoreSubscriptionAlerts(now?)` — `now` injectable
  pour les tests).
- **Idempotence** : relancer la tâche deux fois ne doit rien envoyer deux
  fois (tester explicitement : appeler deux fois, compter une notification).

## 11. Éviter les migrations

Chaque migration est une opération manuelle en production (SQL à lancer par
le propriétaire). Avant d'en créer une :

- **Dériver plutôt que stocker** : référence de paiement courte =
  `'MP-' + id.slice(-6).toUpperCase()`. Stable, unique en pratique, zéro
  colonne.
- **Fenêtre de temps** pour un rappel unique lancé chaque jour : « créé il y a
  entre 24 h et 48 h » → chaque élément tombe dans la fenêtre exactement une
  fois.
- **Réutiliser une colonne de date** pour deux rappels successifs : J-5
  envoyé → `alertSentAt` rempli ; J-1 envoyé si `alertSentAt` date de plus de
  2 jours, puis mis à jour.
- Réutiliser une table existante (mouvements de stock pour les transferts,
  notifications pour les rappels) quand le sens est le même.

Si la migration est nécessaire : additive (colonnes nullables / avec défaut),
une par fonctionnalité, nom explicite, SQL fourni au propriétaire dans la PR
et la doc.

## 12. Pages serveur et composants client

- Page : `requireX('…:view')` en première ligne, `metadata` avec un titre
  français, `dynamic = 'force-dynamic'`, `Promise.all`, puis `PageHeader`
  (titre + une phrase qui explique la page) et un composant client qui reçoit
  des données **sérialisables et déjà mises en forme** (pas d'objet Prisma
  brut, pas de `Decimal` : convertir avant).
- Composant client : un fichier par écran (`transfers-manager.tsx`), appels
  via un petit client `api.ts` qui lit la réponse uniforme, `useState` pour
  l'état d'envoi, `startTransition(router.refresh)` après réussite.
- Un commentaire de tête au-dessus de chaque page, service et composant :
  ce que c'est, pour qui, et renvoi vers la doc ou le service.
