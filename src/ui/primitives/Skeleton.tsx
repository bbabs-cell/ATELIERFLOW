import { cx } from "@/lib/cx";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cx("skeleton-shimmer rounded-md", className)}
    />
  );
}