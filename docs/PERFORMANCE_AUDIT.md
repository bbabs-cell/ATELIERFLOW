# AUDIT PERFORMANCE (Prompt 25) — Rapport factuel

Audit le 2026-09-25. Basé sur la sortie du build Next/Turbopack, l'inventaire
des chunks, et l'inspection du runtime (PWA, sync, rendu). Aucun changement de
code (constat + recommandations).

## Chiffres relevés (build de référence)

| Mesure | Valeur | Commentaire |
|---|---|---|
| Routes servies | 14 × prérendues statiques (`○`) | zéro calcul serveur par requête ; zéro route `/api` (aucun dossier `src/app/api`) |
| JS total (toutes routes) | **≈ 977 Ko** minifiés | dont partagés réutilisés partout |
| Plus gros chunk (partagé UI/home) | **229 Ko** → **≈ 71 Ko gzip** | charge aussi bien sur `/` que sur chaque vue |
| 2e gros chunk | 165 Ko → **≈ 45 Ko gzip** | |
| CSS (unique) | **≈ 46,8 Ko** | tokens + utilitaires Tailwind |
| Polices | 2 familles `next/font` auto-hébergées, latin subset, `display:swap` | seul trafic réseau « externe » = local |
| Images | Aucune image matricielle (0 png/jpg/avif…) — icônes SVG seulement | poids négligeable |

## PASS (vérifiés)

| # | Contrôle | Preuve |
|---|---|---|
| P1 | Prerendu statique intégral | Toutes les routes en `○` (sortie `next build`) — hydratation rapide, pas de blocage serveur, `TTFB` ≈ temps fichier statique (hôte CDN en phase 04). |
| P2 | Aucune dépendance lourde | Pas de lib de graphique (SVG inscrit `MiniChart.tsx`), pas de lib de date (Intl/Date natifs), pas de lib de formulaire ; `lucide-react` icônes importées individuellement (tree-shaking). |
| P3 | Transfert léger au premier rendu | Plus gros chunk ≈ 71 Ko gzip — bien sous les cibles courantes ; en plus réutilisé pour les vues suivantes (mandataire déjà probéchie par le SW). |
| P4 | Sync événementielle, coût idle nul | `SyncEngine` : déclenchement sur événements (`enqueue` → tentative, `onOnline()` → `requeueStuck` + flush), **aucun `setInterval`/polling** ; garde `inFlight` (pas de flush chevauchés), `batchSize`, file nommée par idempotence (`engine.ts:67,106,150,227`). |
| P5 | PWA calibration | `public/sw.js` : shell precache (network-first fallback `/offline`), assets `stale-while-revalidate`, privés `network-only` (`/api /auth /sync /invitation /reset-password`) ; caches versionnés (purge propre à l'activate) ; activation maîtrisée via `SKIP_WAITING` (pas de prise de contrôle inopinée). |
| P6 | Chargement des données hors rendu initial | Les vues lisent IndexedDB dans des `useEffect` : le HTML prérendu n'attend pas la base → FCP statique, la couche client se remplit ensuite. `PwaProvider` ne fait aucun travail périodique (SW seulement). |
| P7 | Bundle petit par route | Les vues métier sont isolées par route (chunks partagés ~45 Ko gz) ; pas de CSS-in-JS (classes statiques Tailwind) → pas de coût d'exécution des styles. |

## Recommandations

**R1 — Scans complets des stores (basse, production)** : les services listent
en ramassant l'ensemble (`customers.list("", false)`, `orders.listOrders`,
`payments.listAll()` pour le dashboard) puis filtrent en JS. À l'échelle
démo : négligeable. À l'horizon de milliers de lignes : indexer/filtrer la
requête (statuts, fenêtre de dates) et/ou paginer côté store. Vitesse d'accès
aux écrans inchangée aujourd'hui.

**R2 — Home « design system » = gros chunk partagé (observation)** : la page
`/` importe la plupart des composites ; son chunk (71 Ko gz) est partagé avec
les vues (réutilisé, donc pas perdu). Si la home devait grossir, `next/dynamic`
sur `Calendar`/`Kanban` découperait sans impact sur les vues produit.

**R3 — `useId` dans `MiniChart` (observation)** : un `useId` par instance pour
le dégradé SVG — inchangé nécessaire, aucun coût supplémentaire notable.

**R4 — Cohérence manifest** : les `shortcuts` du manifeste pointent vers
`/commandes/nouveau` et `/rendez-vous`, routes inexistantes aujourd'hui
(réelles : `/commandes`, `/rdv`). À aligner quand la navigation produit sera
branchée (phase 04), sinon retour sur `/`/offline.

## Synthèse

Categories d'effort à ce stade : transfert très léger (~120–300 Ko gz par
route, un seul fichier majeu), prérendu statique intégral, sync événementielle,
PWA calibrée. La marge d'amélioration principale n'est pas le chargement mais
le volume des scans de données (R1), à traiter lors du provisionnement réel.