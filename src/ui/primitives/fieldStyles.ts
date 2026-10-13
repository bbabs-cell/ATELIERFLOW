import { cx } from "@/lib/cx";

// Champs en 16 px : en dessous, Safari sur iPhone zoome sur le champ à chaque
// saisie et la page reste décalée (règle de la méthode MagyaPro).

export const fieldStyles = (opts?: { invalid?: boolean }) =>
  cx(
    "w-full rounded-md border-2 bg-surface px-3.5 text-ink placeholder:text-ink-faint",
    "min-h-12 text-base font-medium transition-all duration-200 outline-none",
    "focus-visible:outline-none focus-visible:border-flamme-500 focus-visible:shadow-[0_0_0_4px_rgb(255_94_46/0.18)]",
    opts?.invalid
      ? "border-danger focus-visible:border-danger"
      : "border-outline hover:border-flamme-300",
  );