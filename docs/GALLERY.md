# Galerie de modèles

Page `/galerie` (menu « Galerie ») : idées de modèles à montrer aux clients, sans quitter
l'application.

## Pourquoi pas Pinterest dans la page

- Pinterest interdit son affichage dans un autre site (`X-Frame-Options: SAMEORIGIN`,
  `frame-ancestors 'self'`, vérifié le 2026-10-03) : un cadre resterait vide.
- La création automatique de comptes est contraire à ses conditions d'utilisation et
  passe par une vérification anti-robot.

## Fonctionnement

- Recherche libre + idées prêtes (boubou, wax, pagne, kaftan, soirée, mariée, costume…).
- Photos libres de droits **Pexels**, crédit du photographe affiché, grille en
  colonnes, « Voir plus » (24 par page, 50 pages max), aperçu en grand.
- « Envoyer au client » : message WhatsApp avec le lien de la photo.

## Sécurité

- `GET /api/gallery?q=&page=` : session Supabase **vérifiée** (membre d'un atelier).
- Clé `PEXELS_API_KEY` **serveur uniquement**, envoyée en en-tête, jamais au navigateur.
- Réponse filtrée : seules les images HTTPS de `images.pexels.com` et les liens
  `pexels.com` sont gardés ; la CSP n'autorise que `img-src https://images.pexels.com`
  (aucun script ni cadre externe).
- Cache serveur d'un jour par recherche et par page (quota gratuit Pexels : 200/heure).

## Mise en service

1. Créer une clé gratuite sur https://www.pexels.com/api/.
2. Vercel → variables (Production) : `PEXELS_API_KEY`, puis redéployer.

Sans clé, la page affiche « La galerie n'est pas encore activée sur ce site. »

## Fichiers

```
src/domain/gallery/gallery.ts            requête, réponse Pexels filtrée, messages
src/infrastructure/gallery/pexels.ts     appel Pexels (serveur)
src/infrastructure/auth/verifySession.ts session vérifiée (serveur)
src/app/api/gallery/route.ts             route
src/infrastructure/gallery/galleryClient.ts
src/features/gallery/GalleryView.tsx     page
tests/unit/gallery/gallery.test.ts       12 tests
```
