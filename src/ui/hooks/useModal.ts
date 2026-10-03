"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Comportement commun des fenêtres (Dialog) et tiroirs (Drawer) :
 * - seule la fenêtre du dessus réagit au clavier (Échap ferme celle-là
 *   seulement, même quand un reçu s'ouvre par-dessus une fiche) ;
 * - Tab / Maj+Tab restent dans la fenêtre (le focus ne part pas dans la
 *   page derrière) ;
 * - le focus revient sur l'élément qui a ouvert la fenêtre à la fermeture ;
 * - défilement de la page bloqué tant qu'une fenêtre est ouverte.
 * onClose est lu dans une ref : l'effet ne se relance qu'à l'ouverture
 * (sinon le focus revenait sur la fenêtre à chaque frappe).
 */

const stack: symbol[] = [];
let scrollLocks = 0;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useModal(open: boolean, panelRef: RefObject<HTMLElement | null>, onClose: () => void): void {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const id = Symbol("modal");
    stack.push(id);
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    scrollLocks += 1;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== id) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const items = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (items.length === 0) {
        e.preventDefault();
        panelRef.current.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const inside = active instanceof Node && panelRef.current.contains(active);
      if (e.shiftKey && (active === first || !inside || active === panelRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      const index = stack.indexOf(id);
      if (index >= 0) stack.splice(index, 1);
      scrollLocks = Math.max(0, scrollLocks - 1);
      if (scrollLocks === 0) document.body.style.overflow = "";
      if (opener && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, [open, panelRef]);
}
