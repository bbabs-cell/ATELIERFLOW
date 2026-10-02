"use client";

import { forwardRef, type InputHTMLAttributes } from "react";
import { cx } from "@/lib/cx";

export type SwitchProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, ...rest }, ref) => (
    <label
      className={cx(
        "relative inline-flex size-10 cursor-pointer items-center",
        className,
      )}
    >
      <input ref={ref} type="checkbox" className="peer sr-only" {...rest} />
      <span className="relative h-7 w-12 rounded-full bg-anthracite-200 transition-all duration-300 peer-checked:bg-flamme-500 peer-checked:shadow-glow after:absolute after:start-0.5 after:top-0.5 after:size-6 after:rounded-full after:bg-surface after:shadow-soft after:transition-transform after:duration-300 after:ease-[cubic-bezier(0.34,1.56,0.64,1)] peer-checked:after:translate-x-5" />
    </label>
  ),
);
Switch.displayName = "Switch";