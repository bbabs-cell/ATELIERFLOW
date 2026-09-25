"use client";

import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/features/sync/useOnlineStatus";

export function OfflineBanner(): React.ReactElement | null {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-50 flex min-h-10 items-center justify-center gap-2 bg-warning-soft px-4 py-2 text-sm font-medium text-warning"
    >
      <WifiOff className="size-4 shrink-0" aria-hidden="true" />
      <span>
        Hors ligne — vos saisies sont enregistrées localement et seront
        synchronisées au retour du réseau.
      </span>
    </div>
  );
}