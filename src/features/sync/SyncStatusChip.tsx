"use client";

import { useEffect, useState } from "react";
import { Wifi, WifiOff } from "lucide-react";
import { cx } from "@/lib/cx";
import type { SyncEngine, SyncEngineStatus } from "@/application/sync/engine";
import { useOnlineStatus } from "./useOnlineStatus";

export interface SyncStatusChipProps {
  engine?: SyncEngine | null;
}

export function SyncStatusChip({
  engine = null,
}: SyncStatusChipProps): React.ReactElement {
  const online = useOnlineStatus();
  const [engineStatus, setEngineStatus] = useState<SyncEngineStatus | null>(
    null,
  );

  useEffect(() => {
    if (!engine) return undefined;
    return engine.subscribe(setEngineStatus);
  }, [engine]);

  const pending = engineStatus?.pending ?? 0;

  let tone = "bg-success-soft text-success";
  let label = "Synchronisé";
  let icon = <Wifi className="size-3.5 shrink-0" aria-hidden="true" />;
  if (!online) {
    tone = "bg-warning-soft text-warning";
    label = "Hors ligne";
    icon = <WifiOff className="size-3.5 shrink-0" aria-hidden="true" />;
  } else if (pending > 0) {
    tone = "bg-warning-soft text-warning";
    label = `${pending} en attente`;
  }

  return (
    <span
      className={cx(
        "inline-flex min-h-6 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        tone,
      )}
      role="status"
      aria-live="polite"
    >
      {icon}
      {label}
    </span>
  );
}