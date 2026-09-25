"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cx } from "@/lib/cx";

export type DrawerSide = "left" | "right";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  side?: DrawerSide;
  title?: ReactNode;
  children: ReactNode;
}

const position: Record<DrawerSide, string> = {
  right: "right-0 rounded-l-lg",
  left: "left-0 rounded-r-lg",
};

export function Drawer({
  open,
  onClose,
  side = "right",
  title,
  children,
}: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const { body } = document;
    const prev = body.style.overflow;
    body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-chocolat-950/50 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={cx(
          "absolute top-0 h-full w-full max-w-sm bg-surface shadow-modal sm:max-w-md",
          position[side],
        )}
        aria-label={typeof title === "string" ? title : undefined}
      >
        <div className="flex items-center justify-between gap-4 border-b border-anthracite-100 p-4">
          <h2 className="font-display text-xl text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="rounded-md p-1 text-ink-soft hover:bg-anthracite-50 hover:text-ink"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="h-[calc(100%-4rem)] overflow-y-auto p-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}