// GABARIT issu de MagyaPro (tailwind.config.ts) — Tailwind 3.
// Pour Tailwind 4, voir la fin du fichier.

/**
 * Couleur pilotée par une variable CSS, **et qui accepte un modificateur
 * d'opacité**.
 *
 * Toutes les couleurs du thème s'écrivaient `'var(--ink, #211d16)'`. Tailwind
 * accepte cette forme, mais il ne sait pas en dériver une variante d'opacité :
 * il ne peut pas insérer un canal alpha dans une valeur qu'il ne lit pas. Et
 * il ne le signale pas — il **n'émet simplement aucune règle**.
 *
 * Conséquence, mesurée dans la feuille de style produite : `.bg-ink` existe,
 * `.bg-ink\/90` n'existe pas. Vingt-neuf classes du produit étaient donc
 * inertes, sans qu'aucune erreur ne l'indique :
 *
 * - `hover:bg-ink/90` sur une quinzaine de boutons — le survol ne changeait
 *   rien, alors que le code dit le contraire ;
 * - `bg-ink/25` sur les barres inactives de l'histogramme horaire : une barre
 *   sans fond est une barre **invisible**, donc un graphique qui n'affiche que
 *   son heure de pointe ;
 * - `bg-ink/20` sur les filets décoratifs de deux gabarits de vitrine, hauts
 *   d'un pixel et sans couleur : invisibles eux aussi ;
 * - `border-state-warn/30` sur le bandeau d'échéance ajouté hier, qui
 *   retombait sur la bordure neutre globale.
 *
 * `color-mix` fait ce que Tailwind ne peut pas faire ici : mélanger la couleur
 * — quelle que soit sa valeur au moment du rendu, thème clair, thème sombre ou
 * palette de restaurant — avec du transparent. Sans modificateur, la valeur
 * reste exactement celle d'avant, pour ne rien changer aux règles qui
 * fonctionnaient.
 */
function themed(variable: string, fallback: string): string {
  const value = `var(${variable}, ${fallback})`;
  const resolve = ({ opacityValue }: { opacityValue?: string } = {}) => {
    /**
     * Tailwind appelle cette fonction dans **deux** cas, et c'est le piège.
     *
     * - `bg-ink/25` → `opacityValue` vaut `'0.25'`, un nombre ;
     * - `bg-ink` tout court → `opacityValue` vaut `'var(--tw-bg-opacity)'`,
     *   une expression CSS que seul le navigateur sait résoudre.
     *
     * Une première version faisait `Number(opacityValue) * 100` sans
     * distinguer les deux. Sur le second cas cela donnait `NaN%`, donc une
     * déclaration invalide, donc **aucune couleur** — sur chaque fond et
     * chaque texte des deux produits et du site public. Le CSS se compilait
     * sans erreur ; seul le navigateur jetait la règle, en silence.
     *
     * Une valeur d'opacité qui n'est pas un nombre n'a donc rien à faire dans
     * un calcul : la couleur est rendue telle quelle, exactement comme avant
     * l'introduction de cette fonction.
     */
    const alpha = opacityValue === undefined ? Number.NaN : Number(opacityValue);
    return Number.isFinite(alpha)
      ? `color-mix(in srgb, ${value} ${alpha * 100}%, transparent)`
      : value;
  };

  // Tailwind appelle bien cette fonction à la génération — c'est la forme
  // documentée pour une couleur qui doit connaître l'opacité demandée. Ses
  // types publiés, eux, n'annoncent qu'une chaîne pour une couleur imbriquée.
  // La conversion est donc un défaut de déclaration, pas un contournement du
  // fonctionnement : la vérification porte sur le CSS produit.
  return resolve as unknown as string;
}

// Emploi dans `theme.extend.colors` :
export const colors = {
  brand: {
    DEFAULT: themed('--brand', '#ff5e2e'),
    strong: themed('--brand-strong', '#c93f1a'),
    ink: themed('--brand-ink', '#ffffff'),
    text: themed('--brand-text', '#c93f1a'),
    soft: themed('--brand-soft', '#fff1e6'),
  },
  ink: {
    DEFAULT: themed('--ink', '#211d16'),
    muted: themed('--ink-muted', '#6a6153'),
    faint: themed('--ink-faint', '#756b5c'),
  },
  surface: {
    DEFAULT: themed('--surface', '#fbf8f2'),
    raised: themed('--surface-raised', '#ffffff'),
    sunken: themed('--surface-sunken', '#ece5d8'),
    border: themed('--surface-border', '#ddd3c1'),
  },
  nav: {
    DEFAULT: themed('--nav', '#2a2118'),
    raised: themed('--nav-raised', '#35291d'),
    ink: themed('--nav-ink', '#f5efe3'),
    muted: themed('--nav-muted', '#b3a894'),
    border: themed('--nav-border', 'rgba(245,239,227,0.10)'),
  },
  state: {
    ok: themed('--state-ok', '#047857'),
    'ok-soft': themed('--state-ok-soft', '#ecfdf5'),
    warn: themed('--state-warn', '#b45309'),
    'warn-soft': themed('--state-warn-soft', '#fffbeb'),
    bad: themed('--state-bad', '#b91c1c'),
    'bad-soft': themed('--state-bad-soft', '#fef2f2'),
  },
};

export const boxShadow = {
  elev1: 'var(--elev-1, 0 1px 2px rgba(33,29,22,.06), 0 6px 16px -10px rgba(33,29,22,.18))',
  elev2: 'var(--elev-2, 0 2px 4px rgba(33,29,22,.07), 0 16px 32px -18px rgba(33,29,22,.26))',
  glow: '0 10px 28px -10px color-mix(in srgb, var(--brand, #ff5e2e) 50%, transparent), 0 4px 12px -6px color-mix(in srgb, var(--brand, #ff5e2e) 40%, transparent)',
};

/*
 * ── Tailwind 4 ───────────────────────────────────────────────────────────
 * `themed()` est inutile : déclarer les jetons dans le CSS, v4 dérive les
 * opacités (`bg-ink/90`) par color-mix. Les variables elles-mêmes restent
 * celles de `jetons.css`.
 *
 *   @theme inline {
 *     --color-brand: var(--brand);
 *     --color-brand-strong: var(--brand-strong);
 *     --color-brand-ink: var(--brand-ink);
 *     --color-brand-text: var(--brand-text);
 *     --color-brand-soft: var(--brand-soft);
 *     --color-ink: var(--ink);
 *     --color-ink-muted: var(--ink-muted);
 *     --color-ink-faint: var(--ink-faint);
 *     --color-surface: var(--surface);
 *     --color-surface-raised: var(--surface-raised);
 *     --color-surface-sunken: var(--surface-sunken);
 *     --color-surface-border: var(--surface-border);
 *     --color-state-ok: var(--state-ok);
 *     --color-state-ok-soft: var(--state-ok-soft);
 *     --color-state-warn: var(--state-warn);
 *     --color-state-warn-soft: var(--state-warn-soft);
 *     --color-state-bad: var(--state-bad);
 *     --color-state-bad-soft: var(--state-bad-soft);
 *     --shadow-elev1: var(--elev-1);
 *     --shadow-elev2: var(--elev-2);
 *   }
 *
 * Vérifier ensuite dans le CSS produit qu'une classe à opacité existe bien.
 */
