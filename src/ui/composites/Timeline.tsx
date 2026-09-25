import { cx } from "@/lib/cx";
import type { ReactNode } from "react";
import { Badge, type BadgeTone } from "../primitives/Badge";

export interface TimelineItem {
  title: ReactNode;
  description?: ReactNode;
  date?: ReactNode;
  author?: ReactNode;
  icon?: ReactNode;
  status?: ReactNode;
  tone?: BadgeTone;
}

export function Timeline({
  items,
  className,
}: {
  items: TimelineItem[];
  className?: string;
}) {
  return (
    <ol className={cx("space-y-0", className)}>
      {items.map((item, i) => (
        <li key={i} className="relative flex gap-4 pb-6 last:pb-0">
          {i < items.length - 1 ? (
            <span
              aria-hidden="true"
              className="absolute left-4 top-10 bottom-0 w-px bg-anthracite-200"
            />
          ) : null}
          <span className="z-10 flex size-8 shrink-0 items-center justify-center rounded-full border border-outline bg-surface shadow-soft">
            {item.icon}
          </span>
          <div className="min-w-0 pt-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-ink">{item.title}</span>
              {item.status ? <Badge tone={item.tone}>{item.status}</Badge> : null}
            </div>
            {item.description ? (
              <p className="mt-0.5 text-sm text-ink-soft">{item.description}</p>
            ) : null}
            {item.date || item.author ? (
              <p className="mt-0.5 text-xs text-ink-faint">
                {item.date}
                {item.date && item.author ? " · " : ""}
                {item.author}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}