"use client";

import {
  useId,
  useRef,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cx } from "@/lib/cx";
import { useModal } from "../hooks/useModal";

export type DialogSize = "sm" | "md" | "lg";

const sizes: Record<DialogSize, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
};

// Le corps défile seul : en-tête et pied restent visibles, même en paysage sur téléphone.

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
  useModal(open, panelRef, onClose);

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
          "relative flex max-h-[92dvh] w-full animate-scale-in flex-col overflow-hidden rounded-t-xl bg-surface shadow-modal outline-none before:absolute before:inset-x-0 before:top-0 before:h-1.5 before:bg-flamme-gradient sm:max-h-[calc(100dvh-3rem)] sm:rounded-xl",
          sizes[size],
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-anthracite-100 p-4 sm:p-5 [@media(max-height:520px)]:py-2.5">
          <h2 id={titleId} className="min-w-0 font-display text-2xl text-ink [@media(max-height:520px)]:text-xl">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="grid size-10 shrink-0 place-items-center rounded-full text-ink-soft transition-all duration-300 hover:rotate-90 hover:bg-flamme-50 hover:text-flamme-600 pointer-coarse:size-11"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5">{children}</div>
        {footer ? (
          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-anthracite-100 p-4 sm:flex-row sm:flex-wrap sm:justify-end sm:p-5 [@media(max-height:520px)]:py-2.5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}