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
    icon: <Loader2 className="size-8 animate-spin" />,
    tone: "text-chocolat-400",
    defaultTitle: "Chargement…",
  },
  empty: {
    icon: <Inbox className="size-8" />,
    tone: "text-ink-faint",
    defaultTitle: "Aucune donnée pour le moment",
  },
  error: {
    icon: <TriangleAlert className="size-8" />,
    tone: "text-danger",
    defaultTitle: "Une erreur est survenue",
  },
  success: {
    icon: <CheckCircle2 className="size-8" />,
    tone: "text-success",
    defaultTitle: "Opération réussie",
  },
  offline: {
    icon: <CloudOff className="size-8" />,
    tone: "text-ink-soft",
    defaultTitle: "Hors ligne",
  },
  sync: {
    icon: <RefreshCw className="size-8 animate-pulse" />,
    tone: "text-accent",
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
        "flex min-h-40 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-outline bg-surface-2/60 p-8 text-center",
        className,
      )}
    >
      <span className={c.tone}>{c.icon}</span>
      <div>
        <h3 className="font-display text-lg text-ink">{title ?? c.defaultTitle}</h3>
        {description ? (
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-soft">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}