import { cx } from "@/lib/cx";

export const fieldStyles = (opts?: { invalid?: boolean }) =>
  cx(
    "w-full rounded-md border bg-surface px-3 text-ink placeholder:text-ink-faint",
    "min-h-11 text-sm transition-colors duration-150",
    opts?.invalid
      ? "border-danger focus-visible:border-danger"
      : "border-outline hover:border-anthracite-300",
  );