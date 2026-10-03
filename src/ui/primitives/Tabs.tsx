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
        "inline-flex w-full max-w-full items-center gap-1 overflow-x-auto rounded-full bg-chocolat-900 p-1.5 shadow-soft",
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
              "h-9 flex-shrink-0 rounded-full px-4 text-sm font-semibold text-chocolat-200 transition-all duration-300",
              "aria-selected:bg-sunset-gradient aria-selected:text-white aria-selected:shadow-glow",
              "hover:text-white disabled:opacity-50",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}