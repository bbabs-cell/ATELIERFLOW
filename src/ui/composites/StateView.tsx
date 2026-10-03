import { cx } from "@/lib/cx";
import type { ReactNode } from "react";
import {
  Loader2,
  Inbox,
  TriangleAlert,
  CheckCircle2,
  CloudOff,
  RefreshCw,
} from "lucide-react";

export type StateVariant =
  | "loading"
  | "empty"
  | "error"
  | "success"
  | "offline"
  | "sync";

const config: Record<
  StateVariant,
  { icon: ReactNode; tone: string; defaultTitle: string }
> = {
  loading: {
    icon: <Loader2 className="size-7 animate-spin" />,
    tone: "bg-flamme-gradient",
    defaultTitle: "Chargement…",
  },
  empty: {
    icon: <Inbox className="size-7" />,
    tone: "bg-ocean-gradient",
    defaultTitle: "Aucune donnée pour le moment",
  },
  error: {
    icon: <TriangleAlert className="size-7" />,
    tone: "bg-wax-gradient",
    defaultTitle: "Une erreur est survenue",
  },
  success: {
    icon: <CheckCircle2 className="size-7" />,
    tone: "bg-menthe-gradient",
    defaultTitle: "Opération réussie",
  },
  offline: {
    icon: <CloudOff className="size-7" />,
    tone: "bg-ocean-gradient",
    defaultTitle: "Hors ligne",
  },
  sync: {
    icon: <RefreshCw className="size-7 animate-spin" />,
    tone: "bg-sunset-gradient",
    defaultTitle: "Synchronisation en cours…",
  },
};

export interface StateViewProps {
  variant: StateVariant;
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function StateView({
  variant,
  title,
  description,
  action,
  className,
}: StateViewProps) {
  const c = config[variant];
  return (
    <div
      className={cx(
        "relative flex min-h-48 flex-col items-center justify-center gap-4 overflow-hidden rounded-xl border-2 border-dashed border-chocolat-200 bg-surface/70 p-8 text-center backdrop-blur animate-scale-in",
        className,
      )}
    >
      <span aria-hidden="true" className="absolute -top-10 left-1/2 size-40 -translate-x-1/2 rounded-full bg-flamme-300/25 blur-3xl animate-blob" />
      <span className="relative animate-float">
        <span aria-hidden="true" className={cx("absolute inset-0 rounded-2xl opacity-50 blur-lg", c.tone)} />
        <span className={cx("relative grid size-16 place-items-center rounded-2xl text-white shadow-lift animate-gradient", c.tone)}>
          {c.icon}
        </span>
      </span>
      <div className="relative">
        <h3 className="font-display text-xl text-ink">{title ?? c.defaultTitle}</h3>
        {description ? (
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-soft">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="relative mt-1">{action}</div> : null}
    </div>
  );
}
