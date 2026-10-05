"use client";

import Link from "next/link";
import { BellRing, X } from "lucide-react";
import { cx } from "@/lib/cx";
import type { AtelierAlert } from "@/domain/notifications/alerts";

/** Alertes affichées dans l'application (en plus de la sonnerie et de la notification du téléphone). */
export function AlertStack({ alerts, onDismiss }: { alerts: AtelierAlert[]; onDismiss: (key: string) => void }) {
  if (alerts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-3 top-3 z-[55] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-5 sm:top-5 sm:w-96 print:hidden" aria-live="assertive">
      {alerts.map((a) => (
        <div
          key={a.key}
          role="alert"
          className={cx(
            "pointer-events-auto flex w-full items-start gap-3 rounded-2xl border-2 bg-surface p-3 shadow-modal animate-scale-in",
            a.urgent ? "border-azur-400" : "border-flamme-300",
          )}
        >
          <span className={cx("grid size-10 shrink-0 place-items-center rounded-full text-white shadow-soft", a.urgent ? "bg-azur-gradient animate-pulse-ring" : "bg-flamme-gradient")}>
            <BellRing className="size-5 animate-wiggle" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-base font-bold text-ink">{a.title}</p>
            <p className="text-sm text-ink-soft">{a.body}</p>
            <Link
              href={a.url}
              onClick={() => onDismiss(a.key)}
              className="mt-1.5 inline-flex h-9 items-center rounded-full bg-chocolat-900 px-3.5 text-xs font-semibold text-ivoire-50 transition-all hover:-translate-y-0.5 pointer-coarse:h-11"
            >
              Voir
            </Link>
          </div>
          <button
            type="button"
            onClick={() => onDismiss(a.key)}
            aria-label="Fermer l'alerte"
            className="grid size-9 shrink-0 place-items-center rounded-full text-ink-soft transition-all hover:rotate-90 hover:bg-flamme-50 pointer-coarse:size-11"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
