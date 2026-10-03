"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Menu, type LucideIcon } from "lucide-react";
import { cx } from "@/lib/cx";
import { Drawer } from "../primitives/Drawer";

/** Couleur de la fonctionnalité (une couleur = une fonctionnalité). */
export type FeatureTone = "orange" | "blue" | "green" | "brown";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  active?: boolean;
  badge?: ReactNode;
  tone?: FeatureTone;
}

export interface AppShellProps {
  brand: ReactNode;
  navItems: NavItem[];
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
            "group relative flex min-h-12 items-center gap-3 overflow-hidden rounded-full px-2 pr-4 text-sm font-semibold transition-all duration-300",
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
            <span aria-hidden="true" className="size-2 rounded-full bg-chocolat-950 animate-pulse" />
          ) : null}
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="relative min-h-dvh lg:flex">
      {/* Barre supérieure mobile */}
      <header className="dot-grid sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-white/10 bg-chocolat-900/95 px-4 text-ivoire-50 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="Ouvrir le menu"
          className="grid size-11 place-items-center rounded-full bg-white/10 transition-all duration-300 hover:rotate-90 hover:bg-flamme-500"
        >
          <Menu className="size-5" />
        </button>
        <div className="min-w-0 flex-1">{brand}</div>
      </header>

      {/* Navigation latérale desktop */}
      <aside className="dot-grid sticky top-0 hidden h-dvh w-72 shrink-0 flex-col gap-8 overflow-hidden bg-chocolat-900 p-5 text-ivoire-50 lg:flex">
        {cover ? <CoverBackdrop src={cover} dark /> : <AmbientBlobs dark />}
        <div className="relative px-2 pt-2 animate-fade-in">{brand}</div>
        <div className="relative flex-1">{nav(true)}</div>
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

      <main className="relative min-w-0 flex-1 overflow-x-clip">
        <AmbientBlobs className="fixed lg:left-72" />
        <div className="dot-grid-ink pointer-events-none fixed inset-0 lg:left-72" aria-hidden="true" />
        <div className="relative">{children}</div>
      </main>
    </div>
  );
}
