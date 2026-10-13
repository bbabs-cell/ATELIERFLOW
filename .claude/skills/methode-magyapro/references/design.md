# Design — jetons, identités, composants

Sommaire : 1. Palette et jetons · 2. Couleurs pilotées par variables ·
3. Deux produits, un socle · 4. Typographie · 5. Profondeur · 6. Mouvement ·
7. Composants · 8. Textes de l'interface · 9. Erreurs déjà commises

## 1. Palette et jetons

Une palette chaude (sable, crème, brun) traversée par **une seule** couleur de
marque. Tout composant écrit des jetons, jamais une valeur hexadécimale.

| Jeton | Valeur MagyaPro | Usage |
|---|---|---|
| `surface` | `#fbf8f2` sable | fond de travail — jamais du blanc pur (fatigue au soleil) |
| `surface-raised` | `#ffffff` | carte posée sur le sable, en-tête de tableau |
| `surface-sunken` | `#ece5d8` | fond en retrait derrière les cartes |
| `surface-border` | `#ddd3c1` | filets, bordures |
| `ink` | `#211d16` | texte — un brun très sombre, pas un noir neutre |
| `ink-muted` | `#6a6153` | texte secondaire, intitulés de champs |
| `ink-faint` | `#756b5c` (4,9:1) | indices, intitulés de cellules mobiles |
| `brand` | `#ff5e2e` braise | ce qui ne porte pas de texte : graphiques, halos, pastilles |
| `brand-strong` | `#c93f1a` | **fond** du bouton principal (5,0:1 avec blanc) |
| `brand-ink` | `#ffffff` | **libellé** posé sur `brand-strong` |
| `brand-text` | `#c93f1a` | la marque écrite **en texte** sur fond clair |
| `brand-soft` | `#fff1e6` | pastilles et zones d'appel discrètes |
| `state-ok/warn/bad` (+ `-soft`) | vert / ambre / rouge | un **état** vérifiable, jamais une identité |
| `nav-*` | brun torréfié | barre latérale, sombre dans les deux thèmes |

Pourquoi quatre jetons de marque et pas un : une couleur peut faire un bon
fond de bouton et un mauvais texte. L'or de Boutique (`#e0bd52`) porte très
bien un libellé encre, mais écrit en or sur le sable il est illisible — d'où
`brand-text: #806010` (or brûlé, 5,5:1). Toujours vérifier le contraste du
couple réel (fond + texte), pas de la couleur seule. Seuil : 4,5:1.

Règles nommées :

- **L'orange unique** : un seul élément de marque plein par écran — l'action
  principale (et l'entrée de menu active).
- **L'état neutre** : vert/ambre/rouge ne s'approchent jamais de la marque.
  Un écran où tout est coloré est un écran où rien n'est signalé.
- **Le fond qui ne blanchit pas** : blanc pur réservé aux cartes surélevées
  et à l'impression.
- **Les chiffres alignés** : tout nombre lu en colonne porte `tabular-nums`.

## 2. Couleurs pilotées par variables

Les jetons sont des variables CSS déclarées sur `:root` (voir
`assets/jetons.css`) et lues par Tailwind. Cela permet : mode sombre, seconde
identité de produit, couleur choisie par le client sur son site public, et
retour au blanc à l'impression — sans toucher un composant.

Piège mesuré sur MagyaPro (Tailwind 3) : `colors: { ink: 'var(--ink)' }`
fonctionne pour `bg-ink`, mais **`bg-ink/90` ne génère aucune règle**, sans
erreur. 29 classes étaient inertes (survols sans effet, barres de graphique
invisibles). Solution : la fonction `themed()` de
`assets/tailwind-themed.ts`, qui produit un `color-mix(... transparent)`
quand une opacité est demandée.

Second piège dans la même fonction : sans modificateur, Tailwind passe
`opacityValue = 'var(--tw-bg-opacity)'` ; un `Number()` dessus donne `NaN%`,
donc une déclaration invalide, donc **plus aucune couleur nulle part**. Ne
calculer que si la valeur est un nombre fini.

**Tailwind 4 (Atelier Flow)** : déclarer les jetons dans `@theme` avec
`--color-ink: var(--ink)` ; v4 gère `bg-ink/90` via `color-mix` nativement,
`themed()` n'est pas nécessaire. Vérifier quand même dans le CSS produit
qu'une classe à opacité existe (`grep 'bg-ink\\/90' .next/static/css/*`).

Garder les valeurs de repli **identiques** à la déclaration de `:root` : un
repli qui diverge est une seconde vérité en sommeil.

## 3. Deux produits, un socle

MagyaPro a deux produits (Restaurant : bleu nuit + braise ; Boutique : brun +
or) sur une base de code. La seconde identité redéfinit les variables sur un
attribut racine (`[data-boutique-theme='light'|'dark']`). Les composants
n'écrivent que `brand-*` : ils prennent automatiquement la bonne couleur, et
il est impossible de mettre de l'or dans Restaurant par erreur.

Le thème choisi est appliqué par un petit script en ligne dans le `<head>`
(lecture de `localStorage` dans un `try/catch`) **avant** le premier rendu,
pour éviter le flash du mauvais thème.

Administration (super admin) : fond bleu nuit, mode clair par
`[data-admin-theme='light']`. Leçon : ne pas redéfinir `--ink` sur la racine
d'une zone sombre — des boutons `bg-white text-ink` y deviennent blanc sur
blanc. Scoper la variable au seul conteneur qui en a besoin.

## 4. Typographie

- Une famille nommée est une famille **réellement chargée** (`next/font`).
  Corps : Manrope ; titres : `--font-display` avec repli **sans serif**
  (un repli serif produit un mélange visible pendant le chargement).
- La pile système reste derrière : elle dessine l'arabe et les glyphes
  absents, glyphe par glyphe.
- Tailles de texte : 16 px minimum dans les champs (sinon iOS zoome).
- Échéances écrites en toutes lettres (« dans 3 jours », « dépassée de
  2 jours ») plutôt qu'une date à décompter de tête.

## 5. Profondeur

- Ombres à deux couches (contact net + diffusion douce), teintées d'encre
  brune, jamais de noir pur : `elev1`, `elev2`, `glow` pour le bouton
  principal.
- La profondeur vient d'un empilement de valeurs (sunken → surface → raised),
  pas d'une ombre seule. **Pas de carte dans une carte** : un fond creusé et
  un filet suffisent.
- Rayons : `xl` 14 px, `2xl` 20 px, cartes `rounded-3xl`.

## 6. Mouvement

- Seuls `transform` et `opacity` s'animent (le reste force des recalculs de
  mise en page, saccadé sur téléphone d'entrée de gamme).
- Dans un tableau de bord, **aucune animation qui ne répond pas à une action**.
  Seule entrée : un fondu de ~180 ms. Les pages de présentation peuvent faire
  plus, une fois.
- Animations d'entrée en `animation-fill-mode: backwards`, jamais `both` :
  une transformation restée appliquée capture les `position: fixed`
  descendants (barres fixées en bas qui disparaissent).
- `prefers-reduced-motion: reduce` coupe tout globalement.
- Retour tactile : `active:scale-95` sur les boutons et entrées de navigation.

## 7. Composants

**Boutons** : principal (`bg-brand-strong text-brand-ink shadow-glow`), un par
écran ; secondaire (bordure `surface-border`, fond `surface`) ; discret (texte
`ink-muted`) ; danger (`state-bad`) seulement pour une action destructive
confirmée. Hauteur ≥ 44 px (cible tactile). Libellé = verbe + objet
(« Envoyer le transfert », pas « Valider »). Pendant l'envoi : désactivé +
libellé en cours (« Envoi… ») — jamais de double soumission.

**Cartes** : `.card` = `rounded-3xl border border-surface-border bg-surface
shadow-sm`. Une carte = un sujet.

**Champs** : intitulé au-dessus (`ink-muted`, petit), message d'erreur sous
le champ en `state-bad`, en français, qui dit quoi faire. Les erreurs par
champ viennent de Zod (`fieldErrors`) et s'affichent sous le bon champ.

**États vides** : jamais un cadre vide ni un tableau sans ligne. Une phrase
qui dit ce qui apparaîtra ici et le bouton qui permet de commencer. Une image
absente → un monogramme ou une illustration, jamais un rectangle de couleur
(« la règle du cadre jamais vide »).

**Chiffres clés (KPI)** : grille 2×2 sur mobile, 4 colonnes au-delà ; montant
en `tabular-nums`, variation avec un état (`state-ok`/`state-bad`) et une
phrase (« +12 % par rapport à hier »).

**Navigation** : barre latérale sombre ≥ 1024 px ; en dessous, barre basse
(voir `mobile-vitesse.md`). Une entrée qui n'a pas de sens pour ce compte
n'est pas affichée (ex. « Transferts » seulement s'il y a plusieurs
boutiques).

**Impression** (reçus, tickets) : feuille dédiée, fond blanc, aucune
navigation (`print:hidden`), largeur adaptée (58/80 mm pour le thermique).

## 8. Textes de l'interface

- Français simple, vouvoiement, phrases courtes. Pas de jargon (« synchroniser
  », « payload », « 403 »).
- Un message d'erreur dit ce qui s'est passé **et** quoi faire : « Stock
  insuffisant pour Huile 1 L : 4 disponibles. »
- Un message de succès confirme le résultat concret : « 12 produits envoyés
  vers Boutique Médina. »
- Les messages des erreurs serveur sont écrits pour être affichés tels quels
  (voir `architecture.md`, erreurs typées).

## 9. Erreurs déjà commises (à ne pas refaire)

- Deux boutons de marque côte à côte (Clients : « Nouveau client » et
  « Relancer ») → un seul principal, l'autre secondaire.
- Rangée de quatre boutons coincée dans une cellule de tableau mobile →
  cellule `data-label="Actions"` en pleine largeur, boutons `whitespace-nowrap`
  qui passent à la ligne.
- Couleur de marque utilisée pour signaler un état (carte orange = alerte) →
  utiliser `state-*`.
- Classe à opacité sur une couleur variable qui ne générait rien (voir §2).
