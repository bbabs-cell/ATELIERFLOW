---
name: atelierflow-files
description: Use when implementing or modifying file upload/download for the atelierflow SaaS: Cloudflare R2, bucket layout, private access, MIME validation, size limits, signed URLs, tenant-scoped storage (photos clients/commandes/tissus, receipts PDF). Trigger keywords: R2, Cloudflare, upload, download, fichier, file, bucket, signed URL, mime, photo, PDF.
---

# atelierflow-files

Stockage Cloudflare R2 des fichiers privés du SaaS.

## Architecture

- Layout par locataire, indépendant du nom produit :
  `tenants/{tenantId}/{category}/{fileName}` — catégories : `customers/`, `orders/`, `fabrics/`, `receipts/`.
- **Bucket privé par défaut** : aucun accès public/anonyme.
- **Credentials uniquement côté serveur** (API route / serveur). Aucune clé R2 côté frontend, jamais dans le code, jamais dans le bundle.

## Contrôles d'upload

- **Validation MIME réelle** : vérification par magic bytes côté serveur (pas seulement l'extension).
- **Limite de taille** par type (photos ≤ ~8 Mo ; PDF reçus ≤ ~5 Mo), vérifiée côté serveur.
- Whitelist types : photos `image/jpeg`, `image/png`, `image/webp` ; reçus `application/pdf` ; rejet sinon.
- Transcoder les images si pertinent (réduit le poids, standardise).

## Accès

- **URLs signées à court terme** générées côté serveur après vérification d'autorisation (tenant + permission de l'utilisateur). Aucun accès direct de longue durée aux objets privés.
- **Refus cross-tenant** : une URL signée ne doit jamais permettre de lire un objet d'un autre tenant.

## Cycle de vie

- Suppression **logique ou contrôlée selon le type** : reçus immuables (jamais de suppression physique); photos = soft-delete contrôlé ou suppression physique après confirmation explicite. Rien d'auto-destructif.
- Tracks : `files` (id, tenant_id, owner_id, category, bucket, key, mime, size, created_at, deleted_at) avec référence vers l'entité métier.

## Tests

1. upload autorisé (bonne MIME, bonne taille) ;
2. lecture autorisée (URL signée valide, autorisations OK) ;
3. lecture cross-tenant refusée ;
4. upload MIME interdit rejeté ;
5. suppression contrôlée (logique) correcte.