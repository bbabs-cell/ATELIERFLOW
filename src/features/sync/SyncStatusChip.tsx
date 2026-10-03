"use client";

import { useEffect, useState } from "react";
import { CloudOff, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { cx } from "@/lib/cx";
import { peekActiveSession } from "@/application/auth/session";
import type { SyncEngine } from "@/application/sync/engine";
import { getClientsFacade } from "@/features/clients/facade";
import { useOnlineStatus } from "./useOnlineStatus";
import { DATA_CHANGED_EVENT, lastSyncAt, SYNCED_EVENT } from "./useSyncRunner";

export interface SyncStatusChipProps {
  /** Moteur à suivre ; par défaut celui de la session connectée. */
  engine?: SyncEngine | null;
  className?: string;
}

/** Au-delà, l'appareil est signalé comme en retard (le cycle normal est de 30 s). */
const STALE_AFTER_MS = 5 * 60 * 1000;

function since(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days} jour${days > 1 ? "s" : ""}`;
}

/**
 * État de synchronisation de CET appareil : opérations en attente d'envoi
 * et heure du dernier aller-retour réussi avec le serveur. Deux appareils
 * qui affichent des données différentes se repèrent ici d'un coup d'œil.
 */
export function SyncStatusChip({ engine, className }: SyncStatusChipProps): React.ReactElement {
  const online = useOnlineStatus();
  const session = peekActiveSession();
  const connected = session?.mode === "SUPABASE";
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!connected || !session) return;
    const target = engine ?? getClientsFacade().engine;
    const refreshPending = () => void target.unsettledKeys().then((keys) => setPending(keys.size)).catch(() => undefined);
    const refreshLast = () => {
      setLast(lastSyncAt(session.tenantId));
      setNow(Date.now());
      refreshPending();
    };
    void Promise.resolve().then(refreshLast);
    const unsubscribe = target.subscribe((status) => {
      setBusy(status.busy);
      refreshPending();
    });
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    window.addEventListener(SYNCED_EVENT, refreshLast);
    window.addEventListener(DATA_CHANGED_EVENT, refreshLast);
    return () => {
      unsubscribe();
      clearInterval(tick);
      window.removeEventListener(SYNCED_EVENT, refreshLast);
      window.removeEventListener(DATA_CHANGED_EVENT, refreshLast);
    };
  }, [connected, engine, session]);

  const age = last === null ? null : now - last;
  let tone = "bg-success-soft text-success";
  let label = "Synchronisé";
  let icon = <Wifi className="size-3.5 shrink-0" aria-hidden="true" />;
  let title = last ? `Dernière synchronisation ${since(age ?? 0)}` : "Synchronisé";

  if (!online) {
    tone = "bg-warning-soft text-warning";
    label = pending > 0 ? `Hors ligne · ${pending} en attente` : "Hors ligne";
    icon = <WifiOff className="size-3.5 shrink-0" aria-hidden="true" />;
  } else if (connected && pending > 0) {
    tone = "bg-info-soft text-info";
    label = `${pending} en attente`;
    icon = <RefreshCw className={cx("size-3.5 shrink-0", busy && "animate-spin")} aria-hidden="true" />;
  } else if (connected && (age === null || age > STALE_AFTER_MS)) {
    tone = "bg-danger-soft text-danger";
    label = age === null ? "Jamais synchronisé" : `Synchronisé ${since(age)}`;
    title = "Cet appareil n'a pas pu joindre le serveur récemment. Rechargez la page si cela dure.";
    icon = <CloudOff className="size-3.5 shrink-0" aria-hidden="true" />;
  } else if (connected && age !== null) {
    label = `Synchronisé ${since(age)}`;
  }

  return (
    <span
      className={cx(
        "inline-flex min-h-6 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        tone,
        className,
      )}
      role="status"
      aria-live="polite"
      title={title}
    >
      {icon}
      {label}
    </span>
  );
}
