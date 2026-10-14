"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Barre de progression fine en haut de l'écran pendant un changement de page.
 *
 * Pourquoi : sur un téléphone d'entrée de gamme, l'écran suivant met 0,3 à
 * 0,5 s à s'afficher ; sans signe visible, l'ancienne page semblait figée et
 * on touchait le lien une deuxième fois. La barre répond dès le toucher et
 * disparaît quand la nouvelle page est là. Seul `transform` est animé.
 */
export function NavProgress() {
  const pathname = usePathname();
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement) || link.target === "_blank" || link.hasAttribute("download")) return;
      const url = new URL(link.href, location.href);
      if (url.origin !== location.origin || url.pathname === location.pathname) return;
      setPending(url.pathname);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // Nouvelle page affichée (ou navigation abandonnée) : la barre s'efface.
  useEffect(() => {
    if (pending === null) return;
    if (pending === pathname) {
      const done = window.setTimeout(() => setPending(null), 0);
      return () => window.clearTimeout(done);
    }
    const giveUp = window.setTimeout(() => setPending(null), 8000);
    return () => window.clearTimeout(giveUp);
  }, [pending, pathname]);

  if (pending === null || pending === pathname) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-[3px] overflow-hidden print:hidden">
      <div className="h-full origin-left bg-flamme-gradient animate-nav-progress" />
    </div>
  );
}
