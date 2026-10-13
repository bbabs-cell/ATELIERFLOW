/**
 * Réduction d'une image avant envoi, dans le navigateur.
 *
 * Un restaurateur photographie son plat avec son téléphone et l'envoie tel
 * quel : quatre à cinq mégaoctets, plusieurs milliers de pixels de côté. Le
 * fichier était accepté sans transformation — il n'existe aucune bibliothèque
 * de traitement d'image dans ce projet — puis servi à l'identique à chaque
 * visiteur du site public.
 *
 * Sur les connexions de la zone, cette seule photo coûte des dizaines de
 * secondes d'attente et des mégaoctets de forfait, à chaque visite, à des
 * clients qui voulaient juste lire un menu. Et l'envoi lui-même échouait
 * souvent : cinq mégaoctets sur un réseau instable, c'est un dépôt qui part en
 * délai d'attente.
 *
 * La réduction se fait donc sur l'appareil du commerçant, une fois, avant
 * l'envoi. Aucun service tiers, aucune bibliothèque, aucun coût à l'usage :
 * le navigateur sait décoder et ré-encoder une image depuis toujours.
 *
 * WebP est choisi quand il est disponible — il conserve la transparence, ce
 * qu'un JPEG ne fait pas, et pèse nettement moins pour une qualité égale.
 */

/** Taille maximale du plus grand côté, selon l'usage de l'image. */
export const IMAGE_TARGETS = {
  /** Photo de couverture, affichée pleine largeur en tête de page. */
  cover: 1600,
  /** Photo de plat ou de produit, jamais affichée plus grande qu'une carte. */
  product: 1000,
  /** Logo : petit à l'écran, mais on garde de la marge pour les écrans denses. */
  logo: 512,
} as const;

export type ImageTarget = keyof typeof IMAGE_TARGETS;

/**
 * Dimensions de sortie, à proportions conservées.
 *
 * Une image déjà plus petite que la cible n'est pas agrandie : l'étirer
 * n'ajoute aucun détail et ne ferait que gonfler le fichier.
 */
export function targetSize(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number; scaled: boolean } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge || longest === 0) return { width, height, scaled: false };

  const ratio = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
    scaled: true,
  };
}

/** Formats que le navigateur peut redessiner sans perte de sens. */
const RASTER = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * En dessous de ce poids, une image aux bonnes dimensions est laissée
 * intacte : la ré-encoder ne gagnerait rien et pourrait dégrader.
 */
const LEAVE_ALONE_BYTES = 200 * 1024;

function encodesWebp(): boolean {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    return false;
  }
}

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number }> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file);
    return { source: bitmap, width: bitmap.width, height: bitmap.height };
  }

  // Repli pour les navigateurs sans `createImageBitmap` : passage par un
  // objet URL, révoqué dans tous les cas pour ne pas fuir de mémoire.
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('decode'));
      element.src = url;
    });
    return { source: image, width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Rend une version réduite du fichier, ou le fichier d'origine.
 *
 * Ne échoue jamais : une image que le navigateur ne sait pas redessiner part
 * telle quelle. Mieux vaut un envoi lourd qu'un envoi impossible.
 */
export async function downscaleImage(file: File, target: ImageTarget): Promise<File> {
  if (!RASTER.has(file.type)) return file;

  try {
    const { source, width, height } = await decode(file);
    const size = targetSize(width, height, IMAGE_TARGETS[target]);

    if (!size.scaled && file.size <= LEAVE_ALONE_BYTES) return file;

    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;

    const context = canvas.getContext('2d');
    if (!context) return file;
    context.imageSmoothingQuality = 'high';
    context.drawImage(source, 0, 0, size.width, size.height);
    if ('close' in source && typeof source.close === 'function') source.close();

    const type = encodesWebp() ? 'image/webp' : 'image/jpeg';
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, type, 0.82);
    });

    // Un résultat plus lourd que l'original n'a aucun intérêt : cela arrive
    // sur les images déjà très compressées ou en aplats.
    if (!blob || blob.size >= file.size) return file;

    const extension = type === 'image/webp' ? 'webp' : 'jpg';
    const name = file.name.replace(/\.[^.]+$/, '') || 'image';
    return new File([blob], `${name}.${extension}`, { type, lastModified: Date.now() });
  } catch {
    // Décodage refusé, canvas indisponible, image trop grande pour la mémoire
    // de l'appareil : on renvoie l'original plutôt que de bloquer l'envoi.
    return file;
  }
}
