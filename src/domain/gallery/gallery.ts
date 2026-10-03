/**
 * Galerie de modèles : recherche de photos de mode libres de droits
 * (Pexels), affichées dans l'application. La clé du service reste sur le
 * serveur ; ce module ne contient que la validation et la mise en forme.
 */

export const GALLERY_QUERY_MAX = 80;
export const GALLERY_PER_PAGE = 24;
export const GALLERY_MAX_PAGE = 50;

/** Idées de recherche : libellé affiché, requête envoyée (les termes anglais donnent plus de résultats). */
export const GALLERY_SUGGESTIONS: readonly { label: string; query: string }[] = [
  { label: "Boubou", query: "african boubou" },
  { label: "Robe en wax", query: "african print dress" },
  { label: "Ensemble pagne", query: "ankara outfit" },
  { label: "Kaftan", query: "kaftan fashion" },
  { label: "Robe de soirée", query: "evening gown" },
  { label: "Robe de mariée", query: "wedding dress" },
  { label: "Tenue traditionnelle", query: "traditional african clothing" },
  { label: "Costume homme", query: "men suit tailoring" },
  { label: "Chemise homme", query: "men shirt fashion" },
  { label: "Enfant", query: "kids african fashion" },
  { label: "Broderie", query: "embroidery fashion detail" },
  { label: "Jupe", query: "skirt fashion" },
];

export const DEFAULT_GALLERY_QUERY = GALLERY_SUGGESTIONS[0].query;

export interface GalleryPhoto {
  id: number;
  width: number;
  height: number;
  alt: string;
  /** Couleur moyenne, affichée pendant le chargement. */
  color: string;
  /** Vignette de la grille. */
  thumb: string;
  /** Grande image (aperçu plein écran). */
  large: string;
  photographer: string;
  photographerUrl: string;
  /** Page de la photo sur Pexels (crédit). */
  pageUrl: string;
}

export interface GalleryPage {
  query: string;
  page: number;
  photos: GalleryPhoto[];
  total: number;
  hasMore: boolean;
}

/** Requête nettoyée (espaces, longueur) ; null si vide ou inutilisable. */
export function normalizeGalleryQuery(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, GALLERY_QUERY_MAX).trim();
  return cleaned.length >= 2 ? cleaned : null;
}

/** Numéro de page borné (1 à GALLERY_MAX_PAGE). */
export function normalizeGalleryPage(raw: unknown): number {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(Math.floor(n), GALLERY_MAX_PAGE);
}

function httpsUrl(value: unknown, hosts: readonly string[]): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    return hosts.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`)) ? url.toString() : null;
  } catch {
    return null;
  }
}

const IMAGE_HOSTS = ["images.pexels.com"] as const;
const PAGE_HOSTS = ["pexels.com"] as const;

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/**
 * Réponse de l'API Pexels → photos sûres à afficher : seules les images
 * HTTPS de images.pexels.com et les liens de pexels.com sont gardés.
 */
export function parsePexelsSearch(body: unknown, query: string, page: number): GalleryPage {
  const root = (body ?? {}) as { photos?: unknown; total_results?: unknown; next_page?: unknown };
  const photos: GalleryPhoto[] = [];
  for (const raw of Array.isArray(root.photos) ? root.photos : []) {
    const p = (raw ?? {}) as Record<string, unknown>;
    const src = (p.src ?? {}) as Record<string, unknown>;
    const id = typeof p.id === "number" && Number.isSafeInteger(p.id) ? p.id : null;
    const thumb = httpsUrl(src.large ?? src.medium, IMAGE_HOSTS);
    const large = httpsUrl(src.large2x ?? src.large, IMAGE_HOSTS);
    const pageUrl = httpsUrl(p.url, PAGE_HOSTS);
    const width = typeof p.width === "number" && p.width > 0 ? p.width : 0;
    const height = typeof p.height === "number" && p.height > 0 ? p.height : 0;
    if (id === null || !thumb || !large || !pageUrl || !width || !height) continue;
    const color = typeof p.avg_color === "string" && /^#[0-9a-f]{6}$/i.test(p.avg_color) ? p.avg_color : "#d9cbb8";
    photos.push({
      id,
      width,
      height,
      alt: text(p.alt, 200) || "Modèle",
      color,
      thumb,
      large,
      photographer: text(p.photographer, 80) || "Pexels",
      photographerUrl: httpsUrl(p.photographer_url, PAGE_HOSTS) ?? "https://www.pexels.com",
      pageUrl,
    });
  }
  const total = typeof root.total_results === "number" && root.total_results >= 0 ? Math.floor(root.total_results) : photos.length;
  const hasMore = typeof root.next_page === "string" && root.next_page.length > 0 && page < GALLERY_MAX_PAGE;
  return { query, page, photos, total, hasMore };
}

/** Ajoute une page à la liste affichée, sans doublon. */
export function mergeGalleryPhotos(current: readonly GalleryPhoto[], next: readonly GalleryPhoto[]): GalleryPhoto[] {
  const seen = new Set(current.map((p) => p.id));
  return [...current, ...next.filter((p) => !seen.has(p.id))];
}

export function galleryErrorMessage(code: string | null): string {
  switch (code) {
    case "OFFLINE":
      return "Pas de connexion : la galerie a besoin d'Internet pour chercher des modèles.";
    case "GALLERY_NOT_PROVISIONED":
      return "La galerie n'est pas encore activée sur ce site.";
    case "RATE_LIMITED":
      return "Trop de recherches pour le moment. Réessayez dans quelques minutes.";
    case "UNAUTHENTICATED":
      return "Votre session a expiré : reconnectez-vous.";
    case "VALIDATION:query":
      return "Tapez au moins deux lettres.";
    default:
      return "La recherche n'a pas abouti. Réessayez.";
  }
}

/** Message WhatsApp pour montrer un modèle à un client. */
export function galleryShareText(photo: Pick<GalleryPhoto, "pageUrl" | "alt">): string {
  return `Bonjour, voici un modèle qui pourrait vous plaire : ${photo.pageUrl}`;
}
