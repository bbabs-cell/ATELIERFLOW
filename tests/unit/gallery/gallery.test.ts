import { describe, expect, it, vi } from "vitest";
import {
  GALLERY_MAX_PAGE,
  GALLERY_SUGGESTIONS,
  galleryErrorMessage,
  galleryShareText,
  mergeGalleryPhotos,
  normalizeGalleryPage,
  normalizeGalleryQuery,
  parsePexelsSearch,
} from "@/domain/gallery/gallery";
import { GalleryError, searchPexels } from "@/infrastructure/gallery/pexels";
import { contentSecurityPolicy } from "@/infrastructure/http/securityHeaders";

function pexelsPhoto(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    width: 3000,
    height: 4500,
    url: `https://www.pexels.com/photo/robe-${id}/`,
    photographer: "Awa Ndiaye",
    photographer_url: "https://www.pexels.com/@awa",
    avg_color: "#A0522D",
    alt: "Femme en robe wax",
    src: {
      large2x: `https://images.pexels.com/photos/${id}/a.jpeg?h=1300`,
      large: `https://images.pexels.com/photos/${id}/a.jpeg?h=650`,
      medium: `https://images.pexels.com/photos/${id}/a.jpeg?h=350`,
    },
    ...overrides,
  };
}

describe("requête de la galerie", () => {
  it("nettoie les espaces, coupe à 80 caractères, refuse le vide", () => {
    expect(normalizeGalleryQuery("  robe   wax\n")).toBe("robe wax");
    expect(normalizeGalleryQuery("a")).toBeNull();
    expect(normalizeGalleryQuery("   ")).toBeNull();
    expect(normalizeGalleryQuery(null)).toBeNull();
    expect(normalizeGalleryQuery("x".repeat(200))).toHaveLength(80);
  });

  it("borne le numéro de page", () => {
    expect(normalizeGalleryPage("3")).toBe(3);
    expect(normalizeGalleryPage("0")).toBe(1);
    expect(normalizeGalleryPage("abc")).toBe(1);
    expect(normalizeGalleryPage("9999")).toBe(GALLERY_MAX_PAGE);
  });

  it("propose des idées de recherche distinctes", () => {
    const queries = GALLERY_SUGGESTIONS.map((s) => s.query);
    expect(new Set(queries).size).toBe(queries.length);
    expect(queries.every((q) => normalizeGalleryQuery(q) === q)).toBe(true);
  });
});

describe("réponse Pexels", () => {
  it("garde les photos valides avec leur crédit", () => {
    const page = parsePexelsSearch({ photos: [pexelsPhoto(1)], total_results: 120, next_page: "https://api.pexels.com/v1/search?page=2" }, "robe", 1);
    expect(page.hasMore).toBe(true);
    expect(page.total).toBe(120);
    expect(page.photos).toEqual([
      {
        id: 1,
        width: 3000,
        height: 4500,
        alt: "Femme en robe wax",
        color: "#A0522D",
        thumb: "https://images.pexels.com/photos/1/a.jpeg?h=650",
        large: "https://images.pexels.com/photos/1/a.jpeg?h=1300",
        photographer: "Awa Ndiaye",
        photographerUrl: "https://www.pexels.com/@awa",
        pageUrl: "https://www.pexels.com/photo/robe-1/",
      },
    ]);
  });

  it("écarte les images hors de Pexels, non HTTPS ou incomplètes", () => {
    const page = parsePexelsSearch(
      {
        photos: [
          pexelsPhoto(1, { src: { large: "https://evil.example/a.jpg", large2x: "https://evil.example/b.jpg" } }),
          pexelsPhoto(2, { src: { large: "http://images.pexels.com/a.jpg", large2x: "http://images.pexels.com/b.jpg" } }),
          pexelsPhoto(3, { url: "javascript:alert(1)" }),
          pexelsPhoto(4, { width: 0 }),
          pexelsPhoto(5, { id: "5" }),
          null,
          pexelsPhoto(6),
        ],
      },
      "robe",
      1,
    );
    expect(page.photos.map((p) => p.id)).toEqual([6]);
    expect(page.hasMore).toBe(false);
  });

  it("remplace les valeurs manquantes (couleur, texte, photographe)", () => {
    const [photo] = parsePexelsSearch({ photos: [pexelsPhoto(1, { avg_color: "red", alt: "", photographer: 3, photographer_url: "https://x.com" })] }, "q", 1).photos;
    expect(photo.color).toBe("#d9cbb8");
    expect(photo.alt).toBe("Modèle");
    expect(photo.photographer).toBe("Pexels");
    expect(photo.photographerUrl).toBe("https://www.pexels.com");
  });

  it("supporte un corps vide et s'arrête à la dernière page autorisée", () => {
    expect(parsePexelsSearch(null, "q", 1).photos).toEqual([]);
    expect(parsePexelsSearch({ photos: [], next_page: "x" }, "q", GALLERY_MAX_PAGE).hasMore).toBe(false);
  });

  it("ajoute une page sans doublon", () => {
    const a = parsePexelsSearch({ photos: [pexelsPhoto(1), pexelsPhoto(2)] }, "q", 1).photos;
    const b = parsePexelsSearch({ photos: [pexelsPhoto(2), pexelsPhoto(3)] }, "q", 2).photos;
    expect(mergeGalleryPhotos(a, b).map((p) => p.id)).toEqual([1, 2, 3]);
  });
});

describe("searchPexels (serveur)", () => {
  it("envoie la clé dans l'en-tête, jamais dans l'URL, avec cache d'un jour", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ photos: [pexelsPhoto(9)], total_results: 1 }), { status: 200 }));
    const result = await searchPexels("robe wax", 2, "cle-secrete", fetchImpl);
    expect(result.photos).toHaveLength(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit & { next?: { revalidate?: number } }];
    expect(url).not.toContain("cle-secrete");
    expect(new URL(url).searchParams.get("query")).toBe("robe wax");
    expect(new URL(url).searchParams.get("page")).toBe("2");
    expect((init.headers as Record<string, string>).Authorization).toBe("cle-secrete");
    expect(init.next?.revalidate).toBe(86_400);
  });

  it("traduit les erreurs du service", async () => {
    const respond = (status: number) => vi.fn(async () => new Response("{}", { status }));
    await expect(searchPexels("q", 1, "k", respond(429))).rejects.toMatchObject({ code: "RATE_LIMITED", status: 429 });
    await expect(searchPexels("q", 1, "k", respond(401))).rejects.toMatchObject({ code: "GALLERY_NOT_PROVISIONED" });
    await expect(searchPexels("q", 1, "k", respond(500))).rejects.toMatchObject({ code: "GALLERY_UNAVAILABLE" });
    await expect(
      searchPexels("q", 1, "k", vi.fn(async () => {
        throw new Error("réseau");
      })),
    ).rejects.toBeInstanceOf(GalleryError);
  });
});

describe("affichage", () => {
  it("messages en français et partage par lien", () => {
    expect(galleryErrorMessage("OFFLINE")).toContain("connexion");
    expect(galleryErrorMessage("inconnu")).toContain("Réessayez");
    expect(galleryShareText({ pageUrl: "https://www.pexels.com/photo/1/", alt: "x" })).toContain("https://www.pexels.com/photo/1/");
  });

  it("la CSP autorise les images Pexels, pas leurs scripts ni leurs cadres", () => {
    const policy = contentSecurityPolicy();
    const img = policy.split("; ").find((d) => d.startsWith("img-src ")) ?? "";
    expect(img).toContain("https://images.pexels.com");
    expect(policy.split("; ").find((d) => d.startsWith("script-src "))).not.toContain("pexels");
    expect(policy.split("; ").find((d) => d.startsWith("frame-src "))).toBe("frame-src 'none'");
  });
});
