"use client";

import { useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cx } from "@/lib/cx";
import { useModal } from "../hooks/useModal";

export type DrawerSide = "left" | "right";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  side?: DrawerSide;
  title?: ReactNode;
  /** Fond décoratif (ex. photo floutée) placé derrière l'en-tête et le contenu. */
  backdrop?: ReactNode;
  children: ReactNode;
}

const position: Record<DrawerSide, string> = {
  right: "right-0 rounded-l-xl animate-slide-in-right",
  left: "left-0 rounded-r-xl animate-slide-in-left",
};

export function Drawer({
  open,
  onClose,
  side = "right",
  title,
  backdrop,
  children,
}: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useModal(open, panelRef, onClose);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 animate-fade-in bg-chocolat-950/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cx(
          "absolute top-0 h-full w-full max-w-sm overflow-hidden bg-surface shadow-modal outline-none sm:max-w-md",
          position[side],
        )}
        aria-label={typeof title === "string" ? title : undefined}
      >
        {backdrop}
        <div className="relative flex items-center justify-between gap-4 border-b border-anthracite-100 p-4">
          <h2 className="font-display text-2xl text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="grid size-10 shrink-0 place-items-center rounded-full text-ink-soft transition-all duration-300 hover:rotate-90 hover:bg-flamme-50 hover:text-flamme-600 pointer-coarse:size-11"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="relative h-[calc(100%-4rem)] overflow-y-auto p-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}