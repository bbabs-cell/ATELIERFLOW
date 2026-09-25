# PWA.md — PWA fiabilisée (Prompt 12)

Date : 2026-09-24 — Installable, mise à jour contrôlée, écran offline explicite, indicateur de sync global. Vérifié : typecheck, lint, build prod, 26 tests verts.

## 1. Principes (skill atelierflow-offline-sync)

- **Ne cacher que le nécessaire et le sûr** : app shell + assets statiques uniquement. Les routes privées (`/api/*`, `/auth/*`, `/sync`, fichiers, invitations, mot de passe) ne sont **jamais** mises en cache ; hors ligne elles échouent proprement.
- **Mise à jour contrôlée** : le nouveau service worker reste en attente ; le passage à l'activation (« skip waiting ») ne se fait qu'après validation utilisateur, sauf première installation (aucun contrôleur existant → activation sûre immédiate).
- **Écran offline explicite** + **indicateur d'état de sync global** visibles à tout moment.

## 2. Stratégies de cache (spécification testée dans `src/domain/pwa/cachePolicy.ts`)

| Requête | Stratégie | Détail |
|---|---|---|
| Navigation GET même-origine (`mode: navigate`) | **precache** | network-first ; en cas d'échec réseau → cache puis fallback `/offline` |
| `/_next/static/*` et assets (js/css/fonts/images/manifest) | **stale-while-revalidate** | cache d'abord, mise à jour en arrière-plan |
| API / auth / sync / fichiers / données privées | **network-only** | jamais de copie locale |
| POST et non-GET | network-only | jamais interceptés |
| Cross-origin | network-only | |

Caches versionnés : `atelierflow-shell-{v}` + `atelierflow-runtime-{v}` ; les anciens sont purgés à l'activation. `sw.js` réplique la politique (source canonique testée = `cachePolicy.ts`).

## 3. Mise à jour contrôlée

1. Nouveau `sw.js` détecté → installe (sans activer), reste **en attente**.
2. Le client (`ServiceWorkerController` dans `src/infrastructure/pwa/register.ts`) détecte `registration.waiting` / `updatefound` → affiche `UpdatePrompt` (« Nouvelle version disponible »).
3. L'utilisateur valide → message `SKIP_WAITING` → activation → `controllerchange` → rechargement contrôlé de la page.
4. Première installation : aucun contrôleur existant → envoi immédiat de `SKIP_WAITING` (rien à préserver), pas de prompt.

## 4. Manifest et métadonnées

- `public/pwa/manifest.webmanifest` : `standalone`, `theme_color #3e2723`, `background_color #f8f4ea`, icônes SVG `any` + `maskable`, raccourcis « Nouvelle commande » et « Rendez-vous ».
- `layout.tsx` : `manifest`, `appleWebApp`, `formatDetection`, `icons`, `viewport.themeColor`.
- Icônes : `public/pwa/icon.svg` (nécessite RN + fond chocolat) et `public/pwa/maskable.svg` (fond plein, motif en zone sûre).

## 5. Composants fournis

```
public/sw.js                          service worker (cache contrôlé)
src/infrastructure/pwa/register.ts    ServiceWorkerController (enregistrement + flux de mise à jour)
src/features/pwa/PwaProvider.tsx      monté dans le layout racine (banner offline + promp de mise à jour)
src/features/pwa/OfflineBanner.tsx    bandeau explicite hors ligne
src/features/pwa/UpdatePrompt.tsx     validation de mise à jour
src/features/sync/useOnlineStatus.ts  hook online/offline (createOnlineDetector)
src/features/sync/SyncStatusChip.tsx  indicateur global : Synchronisé · N en attente · Hors ligne
src/domain/pwa/cachePolicy.ts         politique de cache (pure, testée)
src/app/offline/page.tsx              page de secours hors ligne (statique, prérendue)
```

`SyncStatusChip` s'abonne au moteur de sync (Prompt 11) via `engine.subscribe(...)` (statut `{ busy, pending }`) : à monter dans l'AppShell authentifié (phase 13+) ; hors shell il reflète déjà l'état réseau.

## 6. Vérifications

- Tests : `tests/unit/pwa/cachePolicy.test.ts` (stratégies, versionnement, jamais de données privées) + 26 tests totaux verts (`npm run test`).
- `npm run typecheck`, `npm run lint`, `npm run build` (pages `/` et `/offline` prérendues) verts.

## 7. À finaliser (phases 04 / 25-26)

- Tester l'installabilité sur le domaine réel (install prompt Chromium/Edge, manifest validé par Lighthouse — audit performé en phase 25-26).
- Icônes PNG (192/512 + apple-touch-icon) pour Safari/iOS/Firefox si nécessaire.