# Sécurité — multi-tenant, écritures, fichiers

Sommaire : 1. Isolement des tenants · 2. Droits et délégation · 3. Écritures
(origine, débit, double action) · 4. IP client · 5. Fichiers envoyés ·
6. Authentification · 7. En-têtes et divers · 8. Paiements, webhooks, crons ·
9. Comment auditer

## 1. Isolement des tenants — le point qui compte le plus

- Le tenant vient **toujours de la session** (`requireX()`), jamais du corps
  de la requête ni de l'URL.
- Tout identifiant reçu du client est re-filtré :
  `findFirst({ where: { id, storeId: context.store.id } })`. Un `findUnique({
  where: { id } })` sur une donnée de tenant est un bug de sécurité.
- Ressource d'un autre tenant → **404 « introuvable »**, pas 403 (un 403
  confirme qu'elle existe).
- Prix, totaux, remises : **recalculés côté serveur** depuis la base. Le
  client envoie des identifiants et des quantités, jamais un montant à croire.
- Opérations entre deux tenants (transfert entre boutiques) : vérifier que
  l'utilisateur a le **droit requis dans les deux** (un simple caissier de la
  boutique d'arrivée ne suffit pas).
- Tester l'isolement à deux niveaux : services (tests unitaires) **et** gardes
  de route (sonde HTTP avec la session d'un autre tenant). Toujours un contrôle
  positif : la même sonde sur ses propres ressources doit répondre 200, sinon
  la sonde ne prouve rien.

## 2. Droits et délégation

- On ne délègue que ce qu'on détient : un administrateur qui gère l'équipe ne
  peut accorder aucune permission qu'il n'a pas (`permissionsBeyond`), et
  **personne ne modifie sa propre adhésion**. (Faille réelle corrigée :
  un admin pouvait s'accorder la suppression de la boutique.)
- Accès support de l'équipe plateforme : lecture seule.
- Mode démonstration : ne peut ni encaisser ni envoyer de message réel.

## 3. Écritures

- **Contrôle d'origine** dans `route()` : pour POST/PUT/PATCH/DELETE, si
  l'en-tête `Origin` est présent et que son hôte ≠ `x-forwarded-host ?? host`,
  refus 403. `Origin: null` → refus. Sans `Origin` (webhooks, crons, serveur
  à serveur) → accepté : seul un navigateur l'envoie. Pourquoi : `SameSite=Lax`
  ne protège pas des sous-domaines du même site (vitrines clients).
- **Limitation de débit** : `hit(clé, règle)` en base (table de tentatives,
  purge opportuniste ~2 %). Règles : `login` 8/5 min, `write` 120/min,
  `twoFactor` 8/5 min, codes à 6 chiffres 6/10 min. La clé isole l'auteur :
  IP **et** compte (deux compteurs : balayage de comptes / bourrage d'un
  compte). Compteur 2FA **par compte**, pas par jeton de connexion (sinon
  chaque nouvelle connexion redonne des essais).
- **Double action** : mises à jour conditionnelles (`updateMany` sur le statut
  attendu, `count === 0` → conflit). Webhooks de paiement idem : un même
  événement traité deux fois ne crédite qu'une fois.
- Corps JSON lu avec une taille bornée (`readJson`), validé par Zod avec des
  maxima partout.

## 4. IP client

Derrière un proxy, `x-forwarded-for` est en partie écrit par le client. Lire
la bonne source selon l'hébergeur, réglée par `CLIENT_IP_SOURCE` :
`vercel` → `x-real-ip` ; `cloudflare` → `cf-connecting-ip` ; `rightmost` →
dernière valeur de XFF (ajoutée par le proxy de confiance) ; `leftmost`
seulement si un proxy de confiance réécrit l'en-tête. Défaut : `vercel` si
`process.env.VERCEL`, sinon `rightmost`. Valeur tronquée à 64 caractères. Une
IP falsifiable rend les limites de débit contournables.

## 5. Fichiers envoyés

- Type décidé par la **signature binaire** (octets magiques), jamais par le nom
  ni le `Content-Type` annoncé. Extension stockée déduite de la détection.
- **SVG refusé** (script embarqué). Liste blanche : PNG, JPEG, WebP (+ PDF si
  besoin).
- Taille max côté serveur, même si le client réduit déjà l'image.
- Nom de fichier généré (aléatoire), jamais celui de l'utilisateur.
- Optimiseur d'images : `remotePatterns` limité à notre hôte de stockage ;
  garder `sharp`/libvips à jour (il décode des fichiers envoyés par des
  inconnus).

## 6. Authentification

Mots de passe scrypt avec sel, comparaison à temps constant. Jetons de session,
de réinitialisation et codes de secours **hachés** en base. Cookie `httpOnly`,
`secure` en production, `sameSite=lax`. Sessions révoquées au changement de
mot de passe. 2FA TOTP en option.

## 7. En-têtes et divers

CSP (penser aux polices et images des vitrines — une CSP trop stricte a déjà
cassé l'affichage), `nosniff`, `X-Frame-Options`, `Referrer-Policy`, HSTS,
`Permissions-Policy`. `dangerouslySetInnerHTML` seulement pour du JSON-LD
échappé (`<` → `<`). URL saisies par l'utilisateur limitées à
`http(s):`. Points d'accès web push en liste blanche d'hôtes. Aucune trace
d'erreur ni message de base renvoyé au client.

## 8. Paiements, webhooks, crons

- Webhook de paiement : signature HMAC comparée à temps constant, horodatage
  à ±5 min, traitement idempotent.
- Paiement manuel (preuve + validation par l'équipe) : la preuve ne peut plus
  être annulée par le client une fois déposée (l'argent est peut-être parti) ;
  la validation prolonge **depuis la fin de la période en cours** si elle est
  dans le futur (payer en avance ne fait perdre aucun jour).
- Crons : secret partagé obligatoire, comparé à temps constant de préférence.

## 9. Comment auditer

1. Lister toutes les routes (`src/app/api/**/route.ts`) et vérifier pour
   chacune : `route()`, garde `requireX`, permission juste, `hit()` sur les
   écritures, Zod, filtre tenant sur chaque identifiant.
2. Sonde HTTP inter-tenants avec contrôle positif.
3. Envoi de faux fichiers (PHP nommé `.png`, HTML `.jpg`, SVG).
4. `npm audit` + jugement d'atteignabilité réel de chaque alerte.
5. Consigner dans `docs/SECURITE.md` : ce qui a tenu, ce qui a été corrigé
   (avec gravité), ce qui reste à décider — et le relire à chaque correctif.
