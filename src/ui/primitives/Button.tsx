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
  "shine inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold " +
  "rounded-full touch-manipulation select-none transition-all duration-200 ease-out " +
  "hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97] " +
  "disabled:pointer-events-none disabled:opacity-50 ";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-flamme-gradient text-white shadow-glow hover:[background-position:100%_50%] " +
    "hover:shadow-[0_16px_36px_-10px_rgb(255_94_46/0.7)]",
  secondary:
    "bg-chocolat-900 text-ivoire-50 shadow-soft hover:bg-chocolat-800 hover:shadow-lift",
  outline:
    "border-2 border-ink bg-surface text-ink shadow-neo hover:shadow-neo-lg hover:-translate-x-0.5 " +
    "active:shadow-none active:translate-x-0",
  ghost: "text-ink-soft hover:bg-flamme-50 hover:text-flamme-700 hover:translate-y-0",
  danger: "bg-danger text-white shadow-soft hover:bg-flamme-700 hover:shadow-lift",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-9 px-4 text-sm pointer-coarse:h-11",
  md: "h-11 px-5 text-sm",
  lg: "h-13 px-7 text-base",
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