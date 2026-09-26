"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Menu, type LucideIcon } from "lucide-react";
import { cx } from "@/lib/cx";
import { Button } from "../primitives/Button";
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
}

export function AppShell({
  brand,
  navItems,
  children,
  onNavigate,
}: AppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const nav = (
    <nav aria-label="Navigation principale" className="flex flex-col gap-1">
      {navItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={() => {
            setMenuOpen(false);
            onNavigate?.(item);
          }}
          className={cx(
            "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
            item.active
              ? "bg-chocolat-900 text-ivoire-100 shadow-soft"
              : "text-ink-soft hover:bg-beige-100 hover:text-ink",
          )}
          aria-current={item.active ? "page" : undefined}
        >
          <item.icon aria-hidden="true" className="size-5 shrink-0" />
          <span className="flex-1 truncate">{item.label}</span>
          {item.badge ? <span className="shrink-0">{item.badge}</span> : null}
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="min-h-dvh lg:flex">
      {/* Barre supérieure mobile */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-outline bg-surface px-4 lg:hidden">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setMenuOpen(true)}
          aria-label="Ouvrir le menu"
          className="!px-2"
        >
          <Menu className="size-5" />
        </Button>
        <div className="min-w-0 flex-1">{brand}</div>
      </header>

      {/* Navigation latérale desktop */}
      <aside className="hidden w-64 shrink-0 flex-col gap-6 border-r border-outline bg-surface-2 p-4 lg:flex">
        <div className="px-2 pt-2">{brand}</div>
        {nav}
      </aside>

      {/* Navigation mobile (drawer) */}
      <Drawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        side="left"
        title="Menu"
      >
        <div className="flex flex-col gap-6">
          {brand}
          {nav}
        </div>
      </Drawer>

      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}