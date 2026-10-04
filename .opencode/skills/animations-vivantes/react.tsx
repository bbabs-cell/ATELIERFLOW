"use client";

/**
 * Composants et recettes du style « animations vivantes ».
 * À copier dans le projet (React 19 / Next.js, Tailwind v4 + animations.css).
 * Remplacer les couleurs Tailwind d'exemple (orange-*, stone-*) par celles de la marque.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

// ---------------------------------------------------------------------------
// Nombres qui défilent
// ---------------------------------------------------------------------------

/**
 * Fait défiler un entier de sa valeur précédente vers `target` (ease-out
 * cubique). La dernière image vaut EXACTEMENT `target` : un montant n'est
 * jamais faux. Sans animation si l'utilisateur a demandé moins de mouvement.
 */
export function useCountUp(target: number, durationMs = 1100): number {
  const [value, setValue] = useState(0);
  const from = useRef(0);

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

/**
 * Nombre animé formaté (« 100 000 F CFA »). L'unité peut passer à la ligne
 * dans une carte étroite, jamais le nombre lui-même.
 */
export function AnimatedNumber({ value, format = String }: { value: number; format?: (n: number) => string }) {
  const shown = useCountUp(value);
  const text = format(shown);
  const unit = /^(.*\d) (\D+)$/.exec(text);
  if (!unit) return <>{text}</>;
  return (
    <>
      <span className="whitespace-nowrap">{unit[1]}</span> <span className="whitespace-nowrap">{unit[2]}</span>
    </>
  );
}

// ---------------------------------------------------------------------------
// Fonds vivants
// ---------------------------------------------------------------------------

/**
 * Formes lumineuses floues qui dérivent lentement. Placer dans un parent
 * `relative` ; en page entière : `className="fixed"` (et `lg:left-72` à côté
 * d'un menu fixe). Les délais négatifs désynchronisent les formes dès le départ.
 */
export function AmbientBlobs({ dark = false, className }: { dark?: boolean; className?: string }) {
  const tone = dark ? "opacity-40" : "opacity-[0.22]";
  return (
    <div aria-hidden="true" className={cx("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <div className={cx("absolute -left-20 -top-24 size-80 rounded-full bg-orange-400 blur-3xl animate-blob", tone)} />
      <div className={cx("absolute -right-24 top-1/3 size-96 rounded-full bg-stone-400 blur-3xl animate-blob", tone)} style={{ animationDelay: "-5s" }} />
      <div className={cx("absolute bottom-[-6rem] left-1/3 size-80 rounded-full bg-amber-300 blur-3xl animate-blob", tone)} style={{ animationDelay: "-9s" }} />
      {dark ? null : (
        <div className={cx("absolute right-1/4 top-[-5rem] size-64 rounded-full bg-orange-300 blur-3xl animate-blob", tone)} style={{ animationDelay: "-3s" }} />
      )}
    </div>
  );
}

/** Photo de couverture en fond (menu, bandeau), floutée et voilée pour rester lisible. */
export function CoverBackdrop({ src, dark = true }: { src: string; dark?: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- décor */}
      <img src={src} alt="" className="absolute inset-0 size-full scale-110 object-cover blur-[6px]" />
      <div className={cx("absolute inset-0", dark ? "bg-stone-950/55" : "bg-white/60")} />
    </div>
  );
}

/** Bandeau d'infos qui défile en continu (piste dupliquée → boucle sans saut). */
export function Ticker({ items }: { items: string[] }) {
  return (
    <div className="relative overflow-hidden" aria-hidden="true">
      <div className="flex w-max animate-marquee gap-8 whitespace-nowrap font-mono text-xs uppercase tracking-[0.18em]">
        {[...items, ...items].map((item, i) => (
          <span key={i} className="flex items-center gap-8">
            {item}
            <span className="text-orange-400">✦</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Données
// ---------------------------------------------------------------------------

/** Histogramme dont les barres poussent l'une après l'autre. */
export function GrowingBars({ values, label }: { values: { label: string; value: number }[]; label: string }) {
  const max = Math.max(1, ...values.map((v) => v.value));
  return (
    <div className="flex h-48 items-end gap-2" role="img" aria-label={label}>
      {values.map((v, i) => (
        <div key={v.label} className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end">
          <div
            className="w-full max-w-12 origin-bottom rounded-t-xl bg-gradient-to-t from-emerald-300 to-emerald-600 shadow-soft transition-all duration-300 animate-grow-up group-hover:brightness-110 group-hover:shadow-glow"
            style={{ height: `${Math.max(4, Math.round((v.value / max) * 100))}%`, animationDelay: `${i * 70}ms` }}
          />
          <p className="mt-2 truncate font-mono text-[10px] uppercase opacity-60">{v.label}</p>
        </div>
      ))}
    </div>
  );
}

/** « … » qui rebondissent (attente d'une réponse). */
export function TypingDots() {
  return (
    <span className="flex gap-1" aria-label="Chargement">
      {[0, 1, 2].map((i) => (
        <span key={i} className="size-2 animate-bounce rounded-full bg-orange-400" style={{ animationDelay: `${i * 120}ms` }} />
      ))}
    </span>
  );
}

/** Compteur qui « saute » à chaque changement (la clé rejoue l'animation). */
export function PopCount({ count }: { count: number }) {
  return (
    <span key={count} className="grid min-w-7 place-items-center rounded-full bg-orange-100 px-2 text-sm font-bold text-orange-700 animate-pop">
      {count}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Recettes de classes (copier telles quelles)
// ---------------------------------------------------------------------------

export const RECIPES = {
  /** Bouton principal : dégradé, halo, reflet au survol, enfoncement à l'appui. */
  primaryButton:
    "shine inline-flex h-11 items-center justify-center gap-2 rounded-full bg-brand-gradient px-5 text-sm font-semibold text-white shadow-glow " +
    "transition-all duration-200 ease-out hover:-translate-y-0.5 hover:[background-position:100%_50%] active:translate-y-0 active:scale-[0.97]",
  /** Bouton contour « néo » : ombre décalée qui grandit. */
  neoButton:
    "inline-flex h-11 items-center gap-2 rounded-full border-2 border-stone-900 bg-white px-5 text-sm font-semibold shadow-neo transition-all duration-200 " +
    "hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-neo-lg active:translate-x-0 active:translate-y-0 active:shadow-none",
  /** Carte cliquable : soulèvement + contour arc-en-ciel + ombre. Ajouter `group`. */
  card:
    "group gradient-border @container relative block overflow-hidden rounded-xl border bg-white/90 p-4 shadow-soft backdrop-blur " +
    "transition-all duration-300 hover:-translate-y-1.5 hover:shadow-lift",
  /** Halo flou dans un coin de carte, qui grossit au survol. */
  cardGlow:
    "pointer-events-none absolute -right-8 -top-8 size-28 rounded-full bg-orange-400 opacity-20 blur-2xl transition-all duration-500 group-hover:scale-150 group-hover:opacity-40",
  /** Pastille d'icône de carte qui pivote au survol. */
  cardIcon:
    "grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-orange-300 to-orange-600 text-white shadow-soft transition-transform duration-500 group-hover:rotate-[-10deg] group-hover:scale-110",
  /** Élément de menu : glisse à droite, icône qui tourne. Actif : dégradé + pastille qui pulse. */
  navItem:
    "group relative flex min-h-12 items-center gap-3 rounded-full px-2 pr-4 text-sm font-semibold transition-all duration-300 hover:translate-x-1 hover:bg-white/10",
  navIcon: "grid size-9 place-items-center rounded-full transition-transform duration-300 group-hover:scale-110 group-hover:rotate-[-8deg]",
  /** Bouton rond (fermer, menu) qui fait un quart de tour. */
  roundIcon: "grid size-10 place-items-center rounded-full transition-all duration-300 hover:rotate-90 hover:bg-orange-50",
  /** Modale : voile qui apparaît, panneau qui monte et grandit, liseré de marque en haut. */
  modalBackdrop: "absolute inset-0 animate-fade-in bg-stone-950/60 backdrop-blur-sm",
  modalPanel:
    "relative w-full max-w-lg animate-scale-in overflow-hidden rounded-t-xl bg-white shadow-modal sm:rounded-xl before:absolute before:inset-x-0 before:top-0 before:h-1.5 before:bg-brand-gradient",
  /** Champ de saisie : bordure de marque au survol, anneau doux au focus. */
  input:
    "h-12 w-full rounded-full border-2 bg-white/90 px-4 text-sm shadow-soft transition-all duration-300 hover:border-orange-300 focus:border-orange-500 focus:shadow-[0_0_0_4px_rgb(245_116_9/0.18)] focus:outline-none",
  /** Ligne de liste : glisse légèrement au survol. */
  listRow: "rounded-lg px-3 py-2.5 transition-all duration-200 hover:translate-x-1 hover:bg-orange-50",
  /** Icône d'action due : anneau qui s'élargit (une seule par écran). */
  dueIcon: "grid size-9 place-items-center rounded-full bg-blue-600 text-white shadow-soft animate-pulse-ring",
  /** Image dans une carte : zoom doux (parent overflow-hidden). */
  zoomImage: "size-full object-cover transition-transform duration-500 group-hover:scale-105",
} as const;

/** Exemple : bandeau d'accueil sombre complet (trame, blobs, titre en dégradé, emoji qui salue). */
export function HeroExample({ title, highlight, children }: { title: string; highlight: string; children?: ReactNode }) {
  return (
    <section className="dot-grid relative overflow-hidden rounded-xl bg-stone-900 p-6 text-white shadow-lift animate-scale-in sm:p-8">
      <AmbientBlobs dark />
      <div className="relative">
        <h1 className="text-4xl font-extrabold leading-[1.05] sm:text-5xl">
          {title} <span className="inline-block origin-[70%_70%] animate-wiggle">👋</span>
          <br />
          <span className="text-gradient">{highlight}</span>
        </h1>
        {children}
      </div>
    </section>
  );
}
