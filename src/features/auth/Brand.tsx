import { Scissors } from "lucide-react";
import { cx } from "@/lib/cx";

/**
 * Marque de l'application (nom configurable, jamais « atelierflow »).
 * Pastille en dégradé animé + ciseaux, anneau qui tourne lentement.
 */
export const BRAND_NAME = "Atelier";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cx("relative grid size-11 shrink-0 place-items-center", className)}>
      <span
        aria-hidden="true"
        className="absolute inset-0 rounded-[14px] bg-aurora-gradient opacity-80 blur-[6px] animate-gradient"
      />
      <span className="relative grid size-11 place-items-center rounded-[14px] bg-flamme-gradient text-white shadow-glow animate-gradient">
        <Scissors aria-hidden="true" className="size-5 -rotate-45 transition-transform duration-500 group-hover:rotate-[-100deg]" />
      </span>
    </span>
  );
}

export function Brand({ tone = "light", subtitle }: { tone?: "light" | "dark"; subtitle?: string }) {
  return (
    <span className="group flex items-center gap-3">
      <BrandMark />
      <span className="min-w-0">
        <span
          className={cx(
            "block font-display text-2xl font-extrabold leading-none tracking-tight",
            tone === "light" ? "text-ivoire-50" : "text-ink",
          )}
        >
          {BRAND_NAME}
          <span className="text-gradient">.</span>
        </span>
        {subtitle ? (
          <span
            className={cx(
              "mt-1 block font-mono text-[10px] uppercase tracking-[0.2em]",
              tone === "light" ? "text-champagne-300" : "text-flamme-600",
            )}
          >
            {subtitle}
          </span>
        ) : null}
      </span>
    </span>
  );
}
