"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cx } from "@/lib/cx";
import { Spinner } from "./Spinner";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "danger";

export type ButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium " +
  "rounded-md touch-manipulation select-none transition-colors duration-150 " +
  "disabled:pointer-events-none disabled:opacity-50 ";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-ivoire-50 hover:bg-chocolat-700 active:bg-chocolat-900 shadow-soft",
  secondary:
    "bg-beige-200 text-chocolat-900 hover:bg-beige-300 active:bg-beige-400",
  outline:
    "border border-chocolat-300 bg-transparent text-chocolat-900 hover:bg-chocolat-50 text-ink",
  ghost: "text-ink-soft hover:bg-anthracite-50 hover:text-ink",
  danger: "bg-danger text-white hover:bg-chocolat-700",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const buttonStyles = (opts: {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) => cx(base, variants[opts.variant ?? "primary"], sizes[opts.size ?? "md"]);

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { variant = "primary", size = "md", loading = false, className, children, disabled, ...rest },
    ref,
  ) => (
    <button
      ref={ref}
      className={cx(buttonStyles({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size="sm" /> : null}
      {children}
    </button>
  ),
);
Button.displayName = "Button";