"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Menu, MoreHorizontal, type LucideIcon } from "lucide-react";
import { cx } from "@/lib/cx";
import { Drawer } from "../primitives/Drawer";

/** Couleur de la fonctionnalité (une couleur = une fonctionnalité). */
export type FeatureTone = "orange" | "blue" | "green" | "brown";

export interface NavItem {
  label: string;
  /** Libellé court pour la barre du bas (cinq cases de 75 px à 375 px). */
  shortLabel?: string;
  href: string;
  icon: LucideIcon;
  active?: boolean;
  badge?: ReactNode;
  tone?: FeatureTone;
}

export interface AppShellProps {
  brand: ReactNode;
  navItems: NavItem[];
  /** Les 4 écrans de la barre du bas (téléphone et tablette, sous 1024 px). */
  bottomItems?: NavItem[];
  children: ReactNode;
  onNavigate?: (item: NavItem) => void;
  /** Contenu en pied de menu (compte, déconnexion…). */
  footer?: ReactNode;
  /** Photo de couverture de l'atelier : fond flouté de la navigation. */
  cover?: string | null;
}

/**
 * Pastille d'icône et état actif de chaque entrée de menu, selon la
 * couleur de sa fonctionnalité : ORANGE commandes, BLEU clients et
 * rendez-vous, VERT argent, MARRON le reste. Le rouge reste réservé aux
 * alertes.
 */
const TONES: Record<FeatureTone, { icon: string; active: string }> = {
  orange: { icon: "from-flamme-300 to-flamme-600", active: "bg-flamme-gradient text-white" },
  blue: { icon: "from-azur-300 to-azur-600", active: "bg-azur-gradient text-white" },
  green: { icon: "from-menthe-300 to-menthe-600", active: "bg-menthe-gradient text-white" },
  brown: { icon: "from-chocolat-300 to-chocolat-600", active: "bg-chocolat-200 text-chocolat-950" },
};

/** Couleur de l'entrée active dans la barre du bas (texte, contraste ≥ 4,5:1 sur le fond clair). */
const BOTTOM_ACTIVE: Record<FeatureTone, string> = {
  orange: "text-flamme-700",
  blue: "text-azur-700",
  green: "text-menthe-600",
  brown: "text-chocolat-900",
};

/** Formes lumineuses qui dérivent lentement (fond vivant). */
export function AmbientBlobs({ dark = false, className }: { dark?: boolean; className?: string }) {
  const tone = dark ? "opacity-40" : "opacity-[0.22]";
  return (
    <div aria-hidden="true" className={cx("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <div className={cx("absolute -left-20 -top-24 size-80 rounded-full bg-flamme-400 blur-3xl animate-blob", tone)} />
      <div
        className={cx("absolute -right-24 top-1/3 size-96 rounded-full bg-chocolat-400 blur-3xl animate-blob", tone)}
        style={{ animationDelay: "-5s" }}
      />
      <div
        className={cx("absolute bottom-[-6rem] left-1/3 size-80 rounded-full bg-champagne-400 blur-3xl animate-blob", tone)}
        style={{ animationDelay: "-9s" }}
      />
      {dark ? null : (
        <div
          className={cx("absolute right-1/4 top-[-5rem] size-64 rounded-full bg-flamme-300 blur-3xl animate-blob", tone)}
          style={{ animationDelay: "-3s" }}
        />
      )}
    </div>
  );
}

/**
 * Photo de couverture en fond, floutée et voilée pour que le menu reste
 * lisible (texte clair sur fond sombre en bureau, texte foncé sur fond
 * clair sur mobile).
 */
function CoverBackdrop({ src, dark = false }: { src: string; dark?: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- lien signé R2, hors optimiseur d'images */}
      <img src={src} alt="" className="absolute inset-0 size-full scale-110 object-cover blur-[6px]" />
      <div className={cx("absolute inset-0", dark ? "bg-chocolat-950/55" : "bg-surface/60")} />
    </div>
  );
}

export function AppShell({
  brand,
  navItems,
  bottomItems = [],
  children,
  onNavigate,
  footer,
  cover,
}: AppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const nav = (dark: boolean) => (
    <nav aria-label="Navigation principale" className="stagger flex flex-col gap-1.5">
      {navItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={() => {
            setMenuOpen(false);
            onNavigate?.(item);
          }}
          className={cx(
            "group relative flex min-h-12 items-center gap-3 overflow-hidden rounded-full px-2 pr-4 text-sm font-semibold transition duration-150",
            item.active
              ? cx(TONES[item.tone ?? "brown"].active, "shadow-soft")
              : dark
                ? "text-chocolat-200 hover:translate-x-1 hover:bg-white/8 hover:text-white"
                : "text-ink-soft hover:translate-x-1 hover:bg-flamme-50 hover:text-ink",
          )}
          aria-current={item.active ? "page" : undefined}
        >
          <span
            className={cx(
              "grid size-9 shrink-0 place-items-center rounded-full transition-transform duration-300 group-hover:scale-110 group-hover:rotate-[-8deg]",
              item.active
                ? "bg-chocolat-950 text-white"
                : cx("bg-gradient-to-br text-white shadow-soft", TONES[item.tone ?? "brown"].icon),
            )}
          >
            <item.icon aria-hidden="true" className="size-[18px]" />
          </span>
          <span className="flex-1 truncate">{item.label}</span>
          {item.badge ? <span className="shrink-0">{item.badge}</span> : null}
          {item.active ? (
            <span aria-hidden="true" className="ambient-motion size-2 rounded-full bg-chocolat-950 animate-pulse" />
          ) : null}
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="relative min-h-dvh lg:flex">
      {/* Barre supérieure mobile */}
      <header className="dot-grid sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-white/10 bg-chocolat-900 px-4 text-ivoire-50 lg:hidden">
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="Ouvrir le menu"
          className="grid size-11 place-items-center rounded-full bg-white/10 transition duration-300 hover:rotate-90 hover:bg-flamme-500"
        >
          <Menu className="size-5" />
        </button>
        <div className="min-w-0 flex-1">{brand}</div>
      </header>

      {/* Navigation latérale desktop */}
      <aside className="dot-grid sticky top-0 hidden h-dvh w-72 shrink-0 flex-col gap-6 overflow-hidden bg-chocolat-900 p-5 text-ivoire-50 lg:flex">
        {cover ? <CoverBackdrop src={cover} dark /> : <div aria-hidden="true" className="ambient-static-dark pointer-events-none absolute inset-0" />}
        <div className="relative px-2 pt-2 animate-fade-in">{brand}</div>
        {/* Le menu défile seul quand l'écran est bas ; logo et compte restent visibles. */}
        <div className="relative -mx-2 min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-1 [scrollbar-color:rgb(255_255_255/0.25)_transparent] [scrollbar-width:thin]">
          {nav(true)}
        </div>
        {footer ? <div className="relative">{footer}</div> : null}
      </aside>

      {/* Navigation mobile (drawer) */}
      <Drawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        side="left"
        title="Menu"
        backdrop={cover ? <CoverBackdrop src={cover} /> : undefined}
      >
        <div className="flex flex-col gap-6">
          {nav(false)}
          {footer}
        </div>
      </Drawer>

      {/*
        Barre du bas sous 1024 px : les 4 écrans les plus ouverts + « Plus ».
        Pourquoi : tout passait par ☰, deux gestes par changement d'écran, des
        dizaines de fois par jour. Placée hors du contenu animé : une
        transformation d'entrée sur un parent capturerait cette barre fixe.
        Sa hauteur est publiée dans --bottom-nav (globals.css) pour que la
        bulle de l'assistant et les messages se posent au-dessus.
      */}
      {bottomItems.length > 0 ? (
        <nav
          aria-label="Navigation rapide"
          data-bottom-nav=""
          className="fixed inset-x-0 bottom-0 z-30 border-t border-outline bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden print:hidden"
        >
          <ul className="mx-auto grid h-16 max-w-xl grid-cols-5">
            {bottomItems.map((item) => (
              <li key={item.href} className="min-w-0">
                <Link
                  href={item.href}
                  onClick={() => onNavigate?.(item)}
                  aria-current={item.active ? "page" : undefined}
                  className={cx(
                    "flex h-full min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 text-[10px] font-semibold transition-transform active:scale-95 min-[360px]:px-1 min-[360px]:text-[11px]",
                    item.active ? BOTTOM_ACTIVE[item.tone ?? "brown"] : "text-ink-soft",
                  )}
                >
                  <span
                    className={cx(
                      "grid h-7 w-12 place-items-center rounded-full transition-colors",
                      item.active ? "bg-chocolat-100" : "",
                    )}
                  >
                    <item.icon aria-hidden="true" className="size-5" />
                  </span>
                  <span className="max-w-full truncate">{item.shortLabel ?? item.label}</span>
                </Link>
              </li>
            ))}
            <li className="min-w-0">
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                aria-label="Plus : ouvrir le menu complet"
                className="flex h-full w-full flex-col items-center justify-center gap-0.5 px-0.5 text-[10px] font-semibold text-ink-soft transition-transform active:scale-95 min-[360px]:px-1 min-[360px]:text-[11px]"
              >
                <span className="grid h-7 w-12 place-items-center rounded-full">
                  <MoreHorizontal aria-hidden="true" className="size-5" />
                </span>
                <span>Plus</span>
              </button>
            </li>
          </ul>
        </nav>
      ) : null}

      <main className="relative min-w-0 flex-1 overflow-x-clip">
        {/* Fond en dégradés fixes : les taches floues animées (filtre de flou recalculé à
            chaque image) faisaient blanchir l'écran au défilement et alourdissaient le PC. */}
        <div aria-hidden="true" className="ambient-static pointer-events-none fixed inset-0 lg:left-72" />
        <div className="dot-grid-ink pointer-events-none fixed inset-0 lg:left-72" aria-hidden="true" />
        <div className="relative">{children}</div>
      </main>
    </div>
  );
}
