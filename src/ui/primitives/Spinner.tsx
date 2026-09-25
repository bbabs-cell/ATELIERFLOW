"use client";

import { forwardRef, type HTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cx } from "@/lib/cx";

const sizes = {
  sm: "size-4",
  md: "size-5",
  lg: "size-6",
} as const;

export interface SpinnerProps
  extends Omit<HTMLAttributes<SVGSVGElement>, "children"> {
  size?: keyof typeof sizes;
}

export const Spinner = forwardRef<SVGSVGElement, SpinnerProps>(
  ({ size = "md", className, ...rest }, ref) => (
    <Loader2
      ref={ref}
      aria-hidden="true"
      className={cx("animate-spin", sizes[size], className)}
      {...rest}
    />
  ),
);
Spinner.displayName = "Spinner";