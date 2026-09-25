"use client";

import { useId, type ReactNode } from "react";
import { cx } from "@/lib/cx";

export interface TabItem {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function Tabs({ items, value, onChange, className }: TabsProps) {
  const elId = useId();
  return (
    <div
      role="tablist"
      aria-label="Onglets"
      className={cx(
        "inline-flex w-full max-w-full items-center gap-1 overflow-x-auto rounded-lg bg-anthracite-100/60 p-1",
        className,
      )}
    >
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            role="tab"
            id={`${elId}-${item.value}`}
            aria-selected={selected}
            aria-controls={`${elId}-panel`}
            disabled={item.disabled}
            onClick={() => onChange(item.value)}
            className={cx(
              "h-9 flex-shrink-0 rounded-md px-3 text-sm font-medium text-ink-soft transition-colors",
              "aria-selected:bg-surface aria-selected:text-ink aria-selected:shadow-soft",
              "hover:text-ink disabled:opacity-50",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}