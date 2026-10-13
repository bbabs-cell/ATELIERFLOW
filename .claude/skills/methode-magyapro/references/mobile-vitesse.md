# Mobile d'abord et vitesse sur réseau faible

Sommaire : 1. Mise en page mobile · 2. Tableaux en fiches · 3. Audit à 375 px ·
4. Images · 5. Chargement et réactivité · 6. Hors-ligne et brouillons ·
7. Notifications

## 1. Mise en page mobile

- On conçoit à **375 px** d'abord, puis on élargit (`sm:`, `md:`, `lg:`).
- **Barre de navigation basse** (`BottomNav`) sous 1024 px : les 4 écrans les
  plus ouverts (choisis selon les droits de la personne) + « Plus » qui ouvre
  le menu complet. Pourquoi : tout passait par ☰, deux gestes par changement
  d'écran, des dizaines de fois par jour.
  - `fixed inset-x-0 bottom-0`, `pb-[env(safe-area-inset-bottom)]`,
    `lg:hidden print:hidden`, fond `surface/95` + `backdrop-blur`.
  - Sa hauteur est exposée en variable `--bottom-nav` ; tout ce qui est fixé en
    bas (panier de caisse) se place à `bottom: var(--bottom-nav)`.
  - Le contenu principal porte `pb-24 lg:pb-0` pour ne pas finir sous la barre.
  - Un menu déroulant/feuille ouvert depuis « Plus » : hauteur max
    `calc(100dvh - <en-tête> - var(--bottom-nav, 0px))`, sinon son bas passe
    sous la barre.
  - Pastille de compteur : rouge pour ce qui attend une action, neutre pour
    une simple nouveauté.
- **Caisse / saisie rapide** : grille de produits en 2 colonnes sur téléphone,
  panier en barre fixe en bas qui s'ouvre en feuille.
- **KPI** en 2×2.
- **Formulaires** : une colonne, champs pleine largeur, bouton principal en bas
  pleine largeur sur mobile (`w-full sm:w-auto`).
- Rangées d'actions : `flex flex-wrap gap-2` — jamais une rangée qui suppose la
  largeur d'un ordinateur. Rangées de boutons de choix (moyens de paiement) :
  `grid grid-cols-2 sm:grid-cols-4` plutôt qu'un `flex` qui déborde.
- Tout enfant de flex qui contient du texte long : `min-w-0` +
  `truncate` ou `break-words`. C'est la cause n°1 des débordements.

## 2. Tableaux en fiches

Sous 768 px, un tableau devient une liste de fiches : chaque ligne est une
carte, chaque cellule affiche son intitulé à gauche et la valeur à droite.
CSS complet : `assets/table-stack.css`.

```tsx
<table className="table-stack table-stack-titled w-full text-sm">
  <thead>…</thead>
  <tbody>
    <tr>
      <td data-label="Produit">{nom}</td>          {/* devient le titre de la fiche */}
      <td data-label="Quantité" className="tabular-nums">{qte}</td>
      <td data-label="Actions">                     {/* pleine largeur, sans intitulé */}
        <div className="flex flex-wrap gap-2">…boutons whitespace-nowrap…</div>
      </td>
    </tr>
  </tbody>
</table>
```

- **Chaque `<td>` a un `data-label`**, sinon la valeur devient anonyme.
  `data-label=""` masque l'intitulé.
- Le tableau et le `tbody` passent en `display: block` : resté `table`, il
  prenait la largeur de son contenu le plus long et chaque fiche débordait.
- Cellules `min-width: 0; overflow-wrap: anywhere`.
- Au-dessus de 768 px, le tableau reste un tableau, dans un conteneur
  `overflow-x-auto` si besoin.

## 3. Audit à 375 px — obligatoire avant de livrer une page

`scripts/audit-debordement.mjs` ouvre chaque page à 375 × 812 dans Chromium
(Playwright), avec une session connectée, et signale :

- `document.documentElement.scrollWidth > innerWidth` (défilement horizontal) ;
- tout élément dont le bord droit dépasse l'écran ;
- **les boutons écrasés** : un bouton plus haut que ~1,8 × sa hauteur de ligne
  dont le texte se casse (cas réel : boutons de ventes réduits à quelques
  pixels). Un audit qui ne cherche que le débordement ne les voit pas.

Prendre aussi une capture (`page.screenshot({ fullPage: true })`) et la
**regarder**. Sur MagyaPro : 49 pages auditées, 0 problème après correction.

Chromium est en `/opt/pw-browsers/chromium` dans les sessions distantes
(`playwright-core` + `executablePath`), ne pas lancer `playwright install`.

## 4. Images

Deux étages, tous deux nécessaires :

**À l'envoi — réduire sur l'appareil** (`assets/downscale-image.ts`). Une photo
de téléphone fait 4–5 Mo ; sur 3G l'envoi échoue en délai d'attente, et elle
serait servie telle quelle à chaque visiteur. On la réduit dans le navigateur
(canvas → WebP, repli JPEG) avant l'envoi, selon l'usage : couverture 1600 px,
produit 1000 px, logo 512 px. Une image plus petite n'est jamais agrandie.
Aucun service tiers, aucune bibliothèque. **Chaque** composant d'envoi doit
l'appeler — y compris ceux de l'administration (oubli constaté sur six
composants).

**À l'affichage — servir la bonne taille** (`assets/optimized-image.ts`).
`optimizedImageProps(src, largeurAffichée)` renvoie `src` + `srcSet` 1x/2x
passant par `/_next/image` (AVIF/WebP, mis en cache par l'hébergeur), mais
**seulement** pour notre propre stockage (`NEXT_PUBLIC_STORAGE_HOST`) — une
adresse étrangère est rendue telle quelle plutôt que cassée par l'optimiseur.
Largeurs arrondies à la liste acceptée par Next.js. Résultat mesuré : un logo
de 1,4 Mo affiché à 32 px → quelques Ko ; page d'accueil 14 images = 129 Ko.

Plus : `loading="lazy"` et `decoding="async"` sous la ligne de flottaison,
`width`/`height` explicites (pas de saut de mise en page), `fetchPriority="high"`
sur l'image principale seule. Configurer `images.remotePatterns` pour l'hôte
de stockage.

Stockage : Cloudflare R2 via le SDK S3 (bucket public, URL publique dans
`NEXT_PUBLIC_STORAGE_HOST`). Penser à un domaine propre (`cdn.exemple.com`).

## 5. Chargement et réactivité

- Pages serveur : chargements indépendants en `Promise.all`. Ne charger les
  données d'un formulaire que si la personne a le droit de s'en servir
  (`canSend ? load() : []`).
- `export const dynamic = 'force-dynamic'` sur les tableaux de bord (données
  par tenant, jamais en cache partagé).
- Après une écriture côté client : `startTransition(() => router.refresh())` —
  l'interface reste utilisable pendant le rafraîchissement.
- Retour immédiat : bouton désactivé + libellé en cours, puis message de
  résultat. Une barre de progression fine pendant la navigation.
- Pas de bibliothèque lourde pour un besoin ponctuel (pas de lib de date, de
  graphique ou d'icônes complète) ; préférer l'API du navigateur et du SVG en
  ligne. Les grosses dépendances (scanner, export Excel) en `import()`
  dynamique, au moment du clic.
- `React.cache()` pour les lectures de contexte appelées plusieurs fois dans
  un même rendu (session, tenant courant).

## 6. Hors-ligne et brouillons

- **File d'attente hors-ligne** pour l'action vitale (la vente) : enregistrée
  en `localStorage` avec le corps exact de la requête, renvoyée au retour du
  réseau. Le serveur revalide tout ; un échec est affiché clairement pour
  traitement manuel, jamais perdu en silence. Un identifiant client par
  opération évite le double enregistrement.
- **Brouillons** des saisies longues (inventaire, transfert, commande) en
  `localStorage`, effacés à la réussite. Toujours dans un `try/catch` :
  navigation privée ou stockage plein ne doivent rien casser.
- Préfixer les clés (`atelierflow:…`) et y inclure le tenant si la saisie lui
  est propre.

## 7. Notifications

- Une notification en base (cloche) + **web push** envoyé après la réponse
  (`after()` de Next.js) pour ne pas ralentir la requête.
- Points d'accès push en liste blanche (FCM, Mozilla, Apple, Windows) : un
  abonnement vers un hôte arbitraire ferait de notre serveur un relais de
  requêtes.
- Messages courts, qui disent quoi et où cliquer ; lien vers l'écran concerné.
- WhatsApp : liens `wa.me` préremplis (reçu, relance de dette) plutôt qu'une
  API payante, quand l'envoi peut partir du téléphone du commerçant.
