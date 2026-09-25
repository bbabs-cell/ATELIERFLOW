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
      <span className="peer-checked:bg-success relative h-6 w-11 rounded-full bg-anthracite-200 transition-colors duration-150 after:absolute after:start-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-surface after:shadow-soft after:transition-transform peer-checked:after:translate-x-5" />
    </label>
  ),
);
Switch.displayName = "Switch";