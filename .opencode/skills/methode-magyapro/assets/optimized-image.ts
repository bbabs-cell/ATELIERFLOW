/**
 * Images de la plateforme servies à la bonne taille.
 *
 * Le logo et les illustrations des pages de présentation sont envoyés depuis
 * l'administration tels quels : 1 à 1,4 Mo chacun, plusieurs milliers de
 * pixels de côté, pour un logo affiché à 32 pixels. Chaque page du produit,
 * tableaux de bord compris, téléchargeait ce logo entier.
 *
 * Plutôt que d'exiger un nouvel envoi de chaque image, on les fait passer par
 * l'optimiseur d'images de Next.js (`/_next/image`) : redimensionnées à la
 * taille d'affichage, converties en AVIF ou WebP selon le navigateur, puis
 * mises en cache par l'hébergeur. Le fichier d'origine ne change pas.
 *
 * Seules les images de notre propre stockage passent par là : une adresse
 * étrangère n'est pas autorisée par l'optimiseur (voir `images.remotePatterns`
 * dans `next.config`), et elle est donc rendue telle quelle plutôt que cassée.
 */

/**
 * Largeurs acceptées par l'optimiseur : ce sont les listes par défaut de
 * Next.js (`imageSizes` puis `deviceSizes`). Toute autre valeur est refusée.
 */
const ALLOWED_WIDTHS = [16, 32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920, 2048, 3840];

function allowedWidth(width: number): number {
  return ALLOWED_WIDTHS.find((candidate) => candidate >= width) ?? ALLOWED_WIDTHS[ALLOWED_WIDTHS.length - 1]!;
}

/** Vrai si l'optimiseur accepte cette adresse. */
export function isOptimizable(src: string, storageHost = process.env.NEXT_PUBLIC_STORAGE_HOST): boolean {
  if (src.startsWith('/') && !src.startsWith('//')) return !src.startsWith('/_next/');
  if (!storageHost) return false;
  try {
    const url = new URL(src);
    return url.protocol === 'https:' && url.hostname === storageHost;
  } catch {
    return false;
  }
}

/** Adresse de l'image redimensionnée à `width` pixels de large. */
export function optimizedImageUrl(
  src: string,
  width: number,
  options: { quality?: number; storageHost?: string } = {},
): string {
  if (!isOptimizable(src, options.storageHost)) return src;
  const w = allowedWidth(width);
  return `/_next/image?url=${encodeURIComponent(src)}&w=${w}&q=${options.quality ?? 75}`;
}

/**
 * `src` et `srcSet` pour une image affichée à `displayWidth` pixels CSS :
 * la version 1x et la version 2x des écrans denses (la plupart des
 * téléphones). Hors stockage de la plateforme, l'image est rendue telle quelle.
 */
export function optimizedImageProps(
  src: string,
  displayWidth: number,
  options: { quality?: number; storageHost?: string } = {},
): { src: string; srcSet?: string } {
  if (!isOptimizable(src, options.storageHost)) return { src };
  return {
    src: optimizedImageUrl(src, displayWidth, options),
    srcSet: `${optimizedImageUrl(src, displayWidth, options)} 1x, ${optimizedImageUrl(src, displayWidth * 2, options)} 2x`,
  };
}
