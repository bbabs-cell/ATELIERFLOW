"use client";

import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cx } from "@/lib/cx";

export type DialogSize = "sm" | "md" | "lg";

const sizes: Record<DialogSize, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
};

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  size?: DialogSize;
  children: ReactNode;
  footer?: ReactNode;
}

export function Dialog({
  open,
  onClose,
  title,
  size = "md",
  children,
  footer,
}: DialogProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const { body } = document;
    const prev = body.style.overflow;
    body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        className="absolute inset-0 animate-fade-in bg-chocolat-950/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cx(
          "relative w-full animate-scale-in overflow-hidden rounded-t-xl bg-surface shadow-modal before:absolute before:inset-x-0 before:top-0 before:h-1.5 before:bg-flamme-gradient sm:rounded-xl",
          sizes[size],
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-anthracite-100 p-4 sm:p-5">
          <h2 id={titleId} className="font-display text-2xl text-ink">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="rounded-full p-1.5 text-ink-soft transition-all duration-300 hover:rotate-90 hover:bg-flamme-50 hover:text-flamme-600"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-4 sm:p-5">{children}</div>
        {footer ? (
          <div className="flex flex-col-reverse gap-2 border-t border-anthracite-100 p-4 sm:flex-row sm:justify-end sm:p-5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}