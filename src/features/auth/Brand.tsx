import { Scissors } from "lucide-react";
import { BRAND_NAME } from "@/config/brand";
import { cx } from "@/lib/cx";

export { BRAND_NAME };

/**
 * Marque de l'application (nom : src/config/brand.ts).
 * Pastille en dégradé animé + ciseaux, anneau qui tourne lentement.
 */
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

export function Brand({ tone = "light", subtitle, logo }: { tone?: "light" | "dark"; subtitle?: string; logo?: string | null }) {
  return (
    <span className="group flex items-center gap-3">
      {logo ? (
        <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-[14px] bg-white shadow-soft">
          {/* eslint-disable-next-line @next/next/no-img-element -- lien signé R2, hors optimiseur d'images */}
          <img src={logo} alt="Logo de l'atelier" className="size-full object-contain p-1" />
        </span>
      ) : (
        <BrandMark />
      )}
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
