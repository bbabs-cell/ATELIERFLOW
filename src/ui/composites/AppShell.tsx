"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Menu, type LucideIcon } from "lucide-react";
import { cx } from "@/lib/cx";
import { Drawer } from "../primitives/Drawer";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  active?: boolean;
  badge?: ReactNode;
}

export interface AppShellProps {
  brand: ReactNode;
  navItems: NavItem[];
  children: ReactNode;
  onNavigate?: (item: NavItem) => void;
  /** Contenu en pied de menu (compte, déconnexion…). */
  footer?: ReactNode;
}

/**
 * Pastille d'icône de chaque entrée de menu — palette resserrée :
 * orange pour le travail de l'atelier, espresso pour la gestion, vert pour
 * l'argent. Le rouge reste réservé aux alertes.
 */
const ICON_TONES = [
  "from-flamme-300 to-flamme-500", // Tableau de bord
  "from-azur-300 to-azur-500", // Clients
  "from-champagne-300 to-champagne-500", // Commandes
  "from-flamme-200 to-flamme-600", // Rendez-vous
  "from-azur-300 to-azur-600", // Stock
  "from-violet-100 to-violet-500", // Équipe
  "from-menthe-300 to-menthe-500", // Abonnement
];

/** Formes lumineuses qui dérivent lentement (fond vivant). */
export function AmbientBlobs({ dark = false, className }: { dark?: boolean; className?: string }) {
  const tone = dark ? "opacity-40" : "opacity-[0.22]";
  return (
    <div aria-hidden="true" className={cx("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <div className={cx("absolute -left-20 -top-24 size-80 rounded-full bg-flamme-400 blur-3xl animate-blob", tone)} />
      <div
        className={cx("absolute -right-24 top-1/3 size-96 rounded-full bg-azur-500 blur-3xl animate-blob", tone)}
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

export function AppShell({
  brand,
  navItems,
  children,
  onNavigate,
  footer,
}: AppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const nav = (dark: boolean) => (
    <nav aria-label="Navigation principale" className="stagger flex flex-col gap-1.5">
      {navItems.map((item, index) => (
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
              ? "bg-sunset-gradient text-chocolat-950 shadow-glow animate-gradient"
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
                ? "bg-chocolat-950 text-champagne-300"
                : cx("bg-gradient-to-br text-white shadow-soft", ICON_TONES[index % ICON_TONES.length]),
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
        <AmbientBlobs dark />
        <div className="relative px-2 pt-2 animate-fade-in">{brand}</div>
        <div className="relative flex-1">{nav(true)}</div>
        {footer ? <div className="relative">{footer}</div> : null}
      </aside>

      {/* Navigation mobile (drawer) */}
      <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} side="left" title="Menu">
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
