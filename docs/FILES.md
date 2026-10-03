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

État au 2026-10-03 : **en service**. Bucket privé `atelier-fichiers` (WEUR, r2.dev
désactivé, aucun domaine public), variables R2 dans Vercel (Production), `0020` appliquée,
aller-retour réel vérifié (envoi, lien signé, refus sans signature, suppression) et
première photo de commande présente dans le bucket.

Procédure (pour un nouvel environnement) :

1. Cloudflare → R2 : créer le bucket privé (ex. `atelier-fichiers`).
2. R2 → « Manage API tokens » : jeton **Object Read & Write** limité à ce bucket.
3. Vercel → variables d'environnement (Production) : `R2_ACCOUNT_ID`,
   `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, puis redéployer.
4. Appliquer `0020_files_register.sql` sur Supabase.
Sans ces variables, la route répond `FILES_NOT_PROVISIONED` (501) et l'interface affiche
« Le stockage des fichiers n'est pas encore activé ».

## 5. Tests

`tests/unit/files/files.test.ts` (signatures, contrôles, clés, service : envoi, refus,
nettoyage, filtre cross-tenant, reçu immuable ; R2 : lien signé, PUT signé) ;
`supabase/validations/files_local.sql` (15 scénarios, local uniquement).
