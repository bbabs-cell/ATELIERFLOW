"use client";

import { forwardRef, type InputHTMLAttributes } from "react";
import { cx } from "@/lib/cx";
import { fieldStyles } from "./fieldStyles";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ invalid, className, ...rest }, ref) => (
    <input
      ref={ref}
      className={cx(fieldStyles({ invalid }), className)}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  ),
);
Input.displayName = "Input";