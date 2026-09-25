"use client";

import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cx } from "@/lib/cx";
import { fieldStyles } from "./fieldStyles";

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ invalid, className, ...rest }, ref) => (
    <textarea
      ref={ref}
      className={cx(fieldStyles({ invalid }), "min-h-24 py-2.5", className)}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  ),
);
Textarea.displayName = "Textarea";