import { cx } from "@/lib/cx";
import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes } from "react";

export interface TableProps {
  children: ReactNode;
  className?: string;
}

export function Table({ children, className }: TableProps) {
  return (
    <div className={cx("-mx-5 overflow-x-auto px-5", className)}>
      <table className="w-full min-w-full text-left text-sm">{children}</table>
    </div>
  );
}

export function THead({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <thead className={cx("border-b border-outline text-xs uppercase tracking-wide text-ink-soft", className)}>
      {children}
    </thead>
  );
}

export function TRow({
  children,
  className,
  ...rest
}: {
  children: ReactNode;
  className?: string;
} & ThHTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cx("border-b border-anthracite-100 last:border-0", className)}
      {...rest}
    >
      {children}
    </tr>
  );
}

export function TH({ className, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cx("px-3 py-2.5 font-medium", className)} {...rest} />;
}

export function TD({ className, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cx("px-3 py-3", className)} {...rest} />;
}