"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, ImageOff, MessageCircle, Search, Sparkles } from "lucide-react";
import { Button, Dialog, StateView } from "@/ui";
import { cx } from "@/lib/cx";
import { peekActiveSession } from "@/application/auth/session";
import {
  DEFAULT_GALLERY_QUERY,
  GALLERY_QUERY_MAX,
  GALLERY_SUGGESTIONS,
  galleryErrorMessage,
  galleryShareText,
  mergeGalleryPhotos,
  normalizeGalleryQuery,
  type GalleryPhoto,
} from "@/domain/gallery/gallery";
import { whatsappUrl } from "@/domain/messaging/whatsapp";
import { GalleryClientError, searchGallery } from "@/infrastructure/gallery/galleryClient";

/**
 * Galerie de modèles : recherche de photos de mode (Pexels) affichées dans
 * l'application, aperçu en grand et partage au client par WhatsApp.
 */
export function GalleryView(): React.ReactElement {
  const session = peekActiveSession();
  const [input, setInput] = useState("");
  const [query, setQuery] = useState(DEFAULT_GALLERY_QUERY);
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<GalleryPhoto | null>(null);
  const controller = useRef<AbortController | null>(null);

  const load = useCallback(async (q: string, p: number) => {
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    setLoading(true);
    setError(null);
    try {
      const result = await searchGallery(q, p, ctrl.signal);
      if (ctrl.signal.aborted) return;
      setPhotos((current) => (p === 1 ? result.photos : mergeGalleryPhotos(current, result.photos)));
      setPage(p);
      setHasMore(result.hasMore);
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setError(galleryErrorMessage(e instanceof GalleryClientError ? e.code : null));
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, []);

  const connected = session?.mode === "SUPABASE";
  useEffect(() => {
    if (!connected) return;
    void (async () => {
      await load(query, 1);
    })();
    return () => controller.current?.abort();
  }, [connected, query, load]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = normalizeGalleryQuery(input);
    if (!q) {
      setError(galleryErrorMessage("VALIDATION:query"));
      return;
    }
    if (q === query) void load(q, 1);
    else setQuery(q);
  }

  function pick(q: string) {
    setInput("");
    if (q === query) void load(q, 1);
    else setQuery(q);
  }

  return (
    <div className="@container mx-auto w-full max-w-6xl px-4 py-6 sm:py-10">
      <header>
        <h1 className="page-title text-4xl text-ink sm:text-5xl">Galerie</h1>
        <p className="mt-1 text-sm text-ink-soft">Des idées de modèles à montrer à vos clients : cherchez, agrandissez, partagez.</p>
      </header>

      {session?.mode !== "SUPABASE" ? (
        <div className="mt-6">
          <StateView variant="empty" title="Connexion nécessaire" description="La galerie cherche les modèles sur Internet : connectez-vous en ligne pour l'utiliser." />
        </div>
      ) : (
        <>
          <form onSubmit={submit} role="search" className="relative z-10 mt-6 flex flex-wrap gap-2 animate-fade-up">
            <div className="relative min-w-0 flex-1 basis-64">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-flamme-500" aria-hidden="true" />
              <input
                type="search"
                aria-label="Rechercher un modèle"
                value={input}
                maxLength={GALLERY_QUERY_MAX}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Rechercher… (boubou, robe wax, costume)"
                className="h-12 w-full rounded-full border-2 border-outline bg-surface/90 pl-11 pr-4 text-sm font-medium text-ink shadow-soft backdrop-blur transition-all duration-300 placeholder:text-ink-faint hover:border-flamme-300 focus:border-flamme-500 focus:shadow-[0_0_0_4px_rgb(245_116_9/0.18)] focus:outline-none"
              />
            </div>
            <Button type="submit" className="h-12">
              <Search className="size-4" aria-hidden="true" />
              Chercher
            </Button>
          </form>

          <ul className="mt-4 flex flex-wrap gap-2" aria-label="Idées de recherche">
            {GALLERY_SUGGESTIONS.map((s) => (
              <li key={s.query}>
                <button
                  type="button"
                  onClick={() => pick(s.query)}
                  aria-pressed={query === s.query}
                  className={cx(
                    "inline-flex h-9 items-center rounded-full border px-4 text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 pointer-coarse:h-11",
                    query === s.query
                      ? "border-transparent bg-flamme-gradient text-white shadow-soft"
                      : "border-outline bg-surface text-ink-soft hover:border-flamme-300 hover:text-flamme-700",
                  )}
                >
                  {s.label}
                </button>
              </li>
            ))}
          </ul>

          <main className="mt-6">
            {error && photos.length === 0 ? (
              <StateView variant="error" title="Galerie indisponible" description={error} action={<Button onClick={() => void load(query, 1)}>Réessayer</Button>} />
            ) : loading && photos.length === 0 ? (
              <ul className="columns-2 gap-3 @2xl:columns-3 @4xl:columns-4" aria-label="Chargement">
                {Array.from({ length: 8 }, (_, i) => (
                  <li key={i} className={cx("skeleton-shimmer mb-3 break-inside-avoid rounded-xl", i % 3 === 0 ? "h-72" : i % 3 === 1 ? "h-56" : "h-64")} />
                ))}
              </ul>
            ) : photos.length === 0 ? (
              <StateView variant="empty" title="Aucun modèle trouvé" description="Essayez un autre mot, ou une des idées ci-dessus." />
            ) : (
              <>
                <ul className="columns-2 gap-3 @2xl:columns-3 @4xl:columns-4">
                  {photos.map((photo) => (
                    <li key={photo.id} className="mb-3 break-inside-avoid">
                      <button
                        type="button"
                        onClick={() => setSelected(photo)}
                        className="group relative block w-full overflow-hidden rounded-xl shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-lift focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flamme-500"
                        style={{ backgroundColor: photo.color, aspectRatio: `${photo.width} / ${photo.height}` }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- images Pexels déjà redimensionnées */}
                        <img src={photo.thumb} alt={photo.alt} loading="lazy" decoding="async" className="size-full object-cover transition-transform duration-500 group-hover:scale-105" />
                        <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-chocolat-950/70 to-transparent px-3 pb-2 pt-6 text-left text-xs font-medium text-white opacity-0 transition-opacity duration-300 group-hover:opacity-100 pointer-coarse:opacity-100">
                          {photo.photographer}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                {error ? <p role="alert" className="mt-4 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p> : null}
                {hasMore ? (
                  <div className="mt-6 flex justify-center">
                    <Button variant="ghost" onClick={() => void load(query, page + 1)} disabled={loading}>
                      <Sparkles className="size-4" aria-hidden="true" />
                      {loading ? "Chargement…" : "Voir plus de modèles"}
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </main>

          <p className="mt-8 text-center text-xs text-ink-faint">
            Photos fournies par{" "}
            <a href="https://www.pexels.com" target="_blank" rel="noopener noreferrer" className="font-semibold underline-offset-2 hover:underline">
              Pexels
            </a>
            , libres d&apos;utilisation.
          </p>
        </>
      )}

      {selected ? <PhotoDialog photo={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}

function PhotoDialog({ photo, onClose }: { photo: GalleryPhoto; onClose: () => void }) {
  const [failed, setFailed] = useState(false);
  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title="Modèle"
      footer={
        <>
          <a
            href={photo.pageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold text-ink-soft transition-all hover:bg-surface-2 hover:text-ink"
          >
            <ExternalLink className="size-4" aria-hidden="true" />
            Voir sur Pexels
          </a>
          <a
            href={whatsappUrl(null, galleryShareText(photo))}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-azur-600 px-5 text-sm font-semibold text-white shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lift"
          >
            <MessageCircle className="size-4" aria-hidden="true" />
            Envoyer au client
          </a>
        </>
      }
    >
      <figure className="flex flex-col gap-3">
        <div className="grid place-items-center overflow-hidden rounded-xl" style={{ backgroundColor: photo.color }}>
          {failed ? (
            <div className="grid h-72 place-items-center text-white">
              <ImageOff className="size-8" aria-hidden="true" />
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- image Pexels déjà redimensionnée
            <img src={photo.large} alt={photo.alt} onError={() => setFailed(true)} className="max-h-[65dvh] w-auto max-w-full object-contain" />
          )}
        </div>
        <figcaption className="text-sm text-ink-soft">
          {photo.alt !== "Modèle" ? <span className="block text-ink first-letter:uppercase">{photo.alt}</span> : null}
          Photo :{" "}
          <a href={photo.photographerUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-flamme-700 hover:underline">
            {photo.photographer}
          </a>{" "}
          sur Pexels
        </figcaption>
      </figure>
    </Dialog>
  );
}
