# AUDIT RESPONSIVE (Prompt 24) — mesuré dans le navigateur

Date : 2026-10-03. Remplace l'audit par lecture de code du 2026-09-25 (antérieur au nouveau
design). Banc reproductible : `scripts/responsive-audit/` (voir son README).

## Méthode

- **Tailles** : 320, 360, 375, 390, 414, 480, 640, 768, 820, 912, 1024, 1280, 1366, 1440,
  1536, 1920 (portrait / bureau) + paysage 640×360, 844×390, 932×430, 1180×820.
- **Entrées** : tactile émulé (`pointer: coarse`) jusqu'à 1024 px, souris au-delà ;
  parcours clavier séparé.
- **Écrans et fenêtres (21)** : tableau de bord, recherche, clients, fiche client (tiroir),
  formulaire client, Kanban, liste des commandes, détail commande, encaissement, reçu,
  formulaire commande, rendez-vous (calendrier, rappels), formulaire rendez-vous, message
  WhatsApp, stock, fiche tissu, équipe, abonnement, menu mobile, connexion.
- **Données piégeuses** : noms, descriptions, adresses et montants longs.
- **Mesures** : défilement horizontal de page ; éléments hors écran ; texte réellement
  coupé par son conteneur (zone du texte comparée à l'ancêtre qui la rogne) ; texte
  tronqué devenu illisible (< 48 px) ; cibles tactiles < 40 px.

## Résultat final

| Contrôle | Avant | Après |
|---|---|---|
| Défilement horizontal de page | 0 | **0** |
| Éléments hors écran | 0 | **0** |
| Textes coupés | 13 cas (KPI « 100 00… », tableau du reçu, rappels, montants, « réapprovisionner ») | **0** |
| Cibles tactiles < 40 px (≤ 1024 px) | 32 contrôles × 15 tailles | **0** |
| Fenêtres en paysage téléphone | titre coupé, contenu inaccessible | en-tête et pied visibles, contenu défilant |
| Clavier | Tab sortait des fenêtres, focus perdu, Échap fermait toutes les fenêtres | piège de focus, focus rendu, Échap ferme la fenêtre du dessus |

## Corrections (à la source, sans rustine)

1. **Cibles tactiles** — variante `pointer-coarse:` (44 px au doigt, compact à la souris) :
   `Button size="sm"`, bouton Fermer des fenêtres et tiroirs (`size-10`/`size-11`),
   flèches du calendrier, étape suivante du Kanban, boutons WhatsApp, suppression d'un
   article, lien « Coordonnées de l'atelier », case « archivés » (zone d'étiquette 44 px),
   onglets de connexion (`h-11`), jours du calendrier (`min-h-10`, écart réduit < 384 px).
2. **Grilles selon la place réelle** — la barre latérale apparaît dès 820 px : entre 820 et
   1024 px la zone de contenu ne fait que 530–730 px. Les grilles du tableau de bord, des
   rappels, de l'agenda et de l'abonnement utilisent des **container queries**
   (`@container`, `@xl:` / `@3xl:` / `@4xl:`) au lieu des points de rupture d'écran.
3. **Pistes de grille bornées** — `grid-cols-1` (= `minmax(0, 1fr)`) sur les grilles à une
   colonne : un contenu insécable (axe des dates du graphique) élargissait la colonne
   au-delà de l'écran et faisait déborder toutes les cartes voisines.
4. **Montants des KPI** — taille relative à la carte (`clamp(1.2rem, 13cqi, 1.65rem)`) et
   unité (« F CFA », « m ») autorisée à passer à la ligne, jamais le nombre.
5. **Fenêtres (Dialog)** — colonne flexible bornée à la hauteur d'écran (`92dvh`, ou
   `100dvh − 3rem`), en-tête et pied fixes, seul le corps défile ; en-tête compact sous
   520 px de haut ; pied qui passe à la ligne (`sm:flex-wrap`).
6. **Reçu** — colonnes du tableau réglées sur la largeur de la feuille (`@container`),
   montants `whitespace-nowrap` avec marge : plus de « 1 185 000 F CFA185 000 F CFA ».
7. **Clavier** — `useModal` (src/ui/hooks) partagé par Dialog et Drawer : seule la fenêtre
   du dessus réagit, Tab / Maj+Tab restent dans la fenêtre, focus rendu à l'ouverture,
   verrou de défilement compté (fenêtres empilées).

## Vérifié

- Matrice complète : 0 défilement horizontal, 0 débordement, 0 texte coupé, 0 cible
  tactile trop petite sur mobile et tablette.
- Clavier (1280 px) : tous les éléments atteints ont un repère de focus visible ; focus
  gardé dans la fenêtre (30 Tab + 10 Maj+Tab) ; Échap ferme et rend le focus au bouton
  d'origine ; fiche commande + reçu : 2 → Échap → 1 → Échap → 0.
- typecheck, lint, build, 299 tests.

## Limites connues

- À 1180×820 (tablette en paysage), traitée comme un écran à souris par le banc, les
  boutons compacts restent à 36 px ; sur une vraie tablette tactile, `pointer: coarse`
  les passe à 44 px.
- Les jours du calendrier font 40 px de haut mais ~36 px de large à 320 px (7 colonnes).
