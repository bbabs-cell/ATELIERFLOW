"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";

/**
 * Changement de page : réponse immédiate au toucher.
 *
 * Pourquoi : l'écran suivant met 0,3 à 0,5 s à s'afficher ; sans signe
 * visible, l'ancienne page semblait figée (mesuré sur PC comme au téléphone)
 * et on touchait le lien une deuxième fois. Dès le toucher, l'entrée du menu
 * visée passe en « active » (`usePendingPath`) et une barre fine avance en
 * haut de l'écran ; tout s'efface quand la nouvelle page est là. Seul
 * `transform` est animé.
 */

let pendingPath: string | null = null;
const listeners = new Set<() => void>();
function setPending(path: string | null) {
  if (pendingPath === path) return;
  pendingPath = path;
  listeners.forEach((fn) => fn());
}
function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Page vers laquelle on est en train d'aller (null quand aucune navigation n'est en cours). */
export function usePendingPath(): string | null {
  return useSyncExternalStore(subscribe, () => pendingPath, () => null);
}

export function NavProgress() {
  const pathname = usePathname();
  const pending = usePendingPath();

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

  // Nouvelle page affichée (ou navigation abandonnée) : retour à l'état normal.
  useEffect(() => {
    if (pending === null) return;
    if (pending === pathname) {
      setPending(null);
      return;
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
