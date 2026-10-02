import { cx } from "@/lib/cx";
import type { ReactNode } from "react";

export interface CardProps {
  className?: string;
  children: ReactNode;
  padded?: boolean;
  /** Soulèvement + bordure arc-en-ciel animée au survol. */
  interactive?: boolean;
}

export function Card({ className, children, padded = true, interactive = true }: CardProps) {
  return (
    <div
      className={cx(
        "rounded-lg border border-outline bg-surface shadow-soft animate-scale-in",
        "transition-all duration-300 ease-out",
        interactive && "gradient-border hover:-translate-y-1 hover:shadow-lift",
        padded && "p-5 sm:p-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("mb-4 flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h3 className="font-display text-lg font-bold leading-snug text-ink">{title}</h3>
        {description ? (
          <p className="mt-0.5 text-sm text-ink-soft">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}