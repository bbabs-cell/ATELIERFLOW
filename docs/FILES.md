# FILES.md — Fichiers privés Cloudflare R2 (Prompt 05)

Date : 2026-10-02. Vérifié : typecheck, lint, build, 293 tests ; migration `0020` sur
PostgreSQL local (15/15) ; route `/api/files` de bout en bout contre la base locale et un
stockage S3 de test (14/14) ; parcours navigateur (photo client 4,4 Mo → 328 Ko JPEG,
vignette, agrandissement, retrait ; reçu PDF archivé).

## 1. Portée

- Photos des **clients**, des **commandes** et des **tissus** (12 par fiche) ; **reçus PDF**
  archivés automatiquement une fois la référence confirmée par le serveur.
- Disposition indépendante du nom commercial :
  `tenants/{atelier}/{customers|orders|fabrics|receipts}/{fiche}/{fichier}.{ext}`.
- Bucket **privé** : aucune lecture publique ; liens de lecture **signés, 10 minutes**.

## 2. Sécurité

- Identifiants R2 **uniquement côté serveur** (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`) ; module `server-only` : la compilation échoue s'il
  est importé côté navigateur. Vérifié : aucun code R2 dans `.next/static`.
- Session Supabase **vérifiée** auprès de GoTrue à chaque requête ; atelier issu du JWT.
- Type réel contrôlé par **signature** (JPEG, PNG, WebP ; PDF pour les reçus), jamais par
  le nom ; tailles : photo 8 Mo, PDF 5 Mo, corps de requête 4 Mo (photos réduites dans le
  navigateur à 1 600 px / JPEG 82 % avant l'envoi).
- `0020_files_register.sql` : plus d'INSERT/UPDATE direct sur `public.files` ;
  `register_file` (permission `files.write`, clé dans le dossier de l'atelier, fiche
  existante dans l'atelier, type, taille, 12 photos max, un seul PDF par reçu) et
  `delete_file` (suppression **logique** des photos ; reçu archivé **immuable**).
- Défense en profondeur : le serveur ne signe jamais une clé hors du dossier de l'atelier ;
  un objet envoyé puis refusé à l'enregistrement est retiré de R2.

## 3. Architecture

```
src/domain/files/files.ts                    catégories, signatures, limites, clés, messages
src/infrastructure/files/r2.ts               R2 (S3 SigV4 via aws4fetch), serveur uniquement
src/infrastructure/files/fileService.ts      envoi / liste / retrait (testable)
src/infrastructure/files/serverContext.ts    session vérifiée + RPC 0020
src/app/api/files/route.ts                   POST (envoi), GET (liste + liens signés)
src/app/api/files/[id]/route.ts              DELETE (retrait logique)
src/infrastructure/files/filesClient.ts      navigateur : appels, réduction des photos
src/features/files/PhotoGallery.tsx          galerie (fiches client, commande, tissu)
src/features/orders/ReceiptViewer.tsx        archivage automatique du PDF du reçu
```

## 4. Mise en service

État au 2026-10-02 : **en production** (bucket `atelier-fichiers`, jeton limité au bucket,
variables sur Vercel, envoi de photo confirmé). Procédure à suivre pour un nouvel
environnement ou une rotation de clé :

1. **Cloudflare → R2 → Create bucket** : nom neutre (ex. `atelier-fichiers`), emplacement
   automatique, classe Standard. Dans **Settings** du bucket, laisser **Public access**
   désactivé : ni domaine `r2.dev`, ni domaine personnalisé. Aucune règle CORS n'est
   nécessaire, car le navigateur ne parle jamais directement à R2 : l'envoi passe par
   `/api/files` et la lecture par des liens signés ouverts en `<img>`.
2. **R2 → Manage API tokens → Create API token** : permission **Object Read & Write**,
   **limité à ce bucket** (« Apply to specific buckets only »), sans date d'expiration ni
   filtre IP (les adresses Vercel varient). Noter l'**Access Key ID** et le
   **Secret Access Key** (affiché une seule fois) ; l'**Account ID** figure sur la page R2.
3. **Vérifier** depuis un poste, avec un `.env.local` non commité :
   ```
   R2_ACCOUNT_ID=…  R2_BUCKET=atelier-fichiers  R2_ACCESS_KEY_ID=…  R2_SECRET_ACCESS_KEY=…
   node --env-file=.env.local scripts-provisioning/verify-r2.mjs
   ```
   Le script écrit deux objets sonde sous `_provisioning/` (hors `tenants/`), contrôle
   qu'un lien signé fonctionne, que l'accès anonyme, un lien falsifié et un lien
   réutilisé pour un autre objet sont **refusés**, puis retire les sondes. Attendu :
   `R2 prêt (bucket privé, liens signés)`. Si l'accès anonyme passe, le bucket est
   public : désactiver l'accès public avant d'aller plus loin.
4. **Vercel → atelierflow → Settings → Environment Variables** (Production et Preview,
   type **Sensitive**) : `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`,
   `R2_SECRET_ACCESS_KEY` (ne pas définir `R2_ENDPOINT`, réservé aux tests). Puis
   **redéployer** : les variables ne s'appliquent qu'aux nouveaux déploiements.
5. **Contrôle final dans l'application** : ajouter une photo sur une fiche client, la
   rouvrir sur un autre appareil, la retirer ; émettre un reçu et vérifier son archivage.

Sans ces variables, la route répond `FILES_NOT_PROVISIONED` (501) et l'interface affiche
« Le stockage des fichiers n'est pas encore activé ». Ne jamais supprimer un bucket
existant sans confirmation explicite.

## 5. Tests

`tests/unit/files/files.test.ts` (signatures, contrôles, clés, service : envoi, refus,
nettoyage, filtre cross-tenant, reçu immuable ; R2 : lien signé, PUT signé) ;
`supabase/validations/files_local.sql` (15 scénarios, local uniquement) ;
`scripts-provisioning/verify-r2.mjs` (bucket réel : écriture, lien signé, refus anonyme,
lien falsifié ou détourné ; essayé sur deux stockages S3 locaux : refus anonyme et
mauvais secret détectés, stockage sans authentification signalé comme non privé).
