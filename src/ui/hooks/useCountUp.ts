"use client";

import { useEffect, useRef, useState } from "react";

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/**
 * Fait défiler un nombre entier de sa valeur précédente vers `target`
 * (ease-out). Toujours entier : aucune valeur financière n'est arrondie
 * autrement qu'à l'affichage de la transition, la valeur finale est exacte.
 *
 * `fromZero` : défiler depuis 0 au premier affichage. À réserver à la
 * première apparition ; à chaque retour sur l'écran, compter depuis 0 pendant
 * plus d'une seconde retardait la lecture et redessinait l'écran à chaque image.
 */
export function useCountUp(target: number, durationMs = 600, fromZero = true): number {
  const [value, setValue] = useState(fromZero ? 0 : target);
  const from = useRef(fromZero ? 0 : target);

  useEffect(() => {
    const start = from.current;
    if (prefersReducedMotion() || start === target) {
      from.current = target;
      const frame = requestAnimationFrame(() => setValue(target));
      return () => cancelAnimationFrame(frame);
    }
    const startedAt = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - startedAt) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(t === 1 ? target : Math.round(start + (target - start) * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
      else from.current = target;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);

  return value;
}
