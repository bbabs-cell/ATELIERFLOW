import { cx } from "@/lib/cx";
import type { ReactNode } from "react";

export type BadgeTone =
  | "neutral"
  | "primary"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "blue";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-anthracite-100 text-anthracite-700 ring-1 ring-inset ring-anthracite-200",
  // ORANGE : commandes, actions
  primary: "bg-flamme-gradient text-white shadow-[0_4px_12px_-4px_rgb(245_116_9/0.6)]",
  accent: "bg-flamme-100 text-flamme-700 ring-1 ring-inset ring-flamme-200",
  // VERT : argent
  success: "bg-menthe-100 text-menthe-600 ring-1 ring-inset ring-menthe-300",
  // ROUGE : alertes (attention / grave)
  warning: "bg-wax-50 text-wax-600 ring-1 ring-inset ring-wax-200",
  danger: "bg-wax-100 text-wax-600 ring-1 ring-inset ring-wax-300",
  // MARRON : information neutre
  info: "bg-chocolat-50 text-chocolat-700 ring-1 ring-inset ring-chocolat-200",
  // BLEU : clients, rendez-vous
  blue: "bg-azur-100 text-azur-700 ring-1 ring-inset ring-azur-300",
};

export interface BadgeProps {
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
  children?: ReactNode;
}

export function Badge({
  tone = "neutral",
  dot = false,
  className,
  children,
}: BadgeProps) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap animate-pop",
        children === undefined && "px-2",
        tones[tone],
        className,
      )}
    >
      {dot ? <span className="size-1.5 animate-pulse rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}