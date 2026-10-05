"use client";

import { useEffect, useState } from "react";
import { BellRing, X } from "lucide-react";
import { peekActiveSession } from "@/application/auth/session";
import { ALERT_PREFS_EVENT, readAlertPrefs, writeAlertPrefs } from "@/infrastructure/notifications/alertStore";
import { playChime, unlockAudio } from "@/infrastructure/notifications/chime";
import { notificationPermission, requestNotificationPermission } from "@/infrastructure/notifications/systemNotifications";

const DISMISSED = "atelier.alerts.invite.dismissed";

/** Invitation à activer la sonnerie, tant qu'elle n'est ni activée ni refusée sur cet appareil. */
export function AlertsInvite({ className }: { className?: string }) {
  const tenantId = peekActiveSession()?.tenantId ?? null;
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    const sync = () => {
      let dismissed = false;
      try {
        dismissed = window.localStorage.getItem(DISMISSED) === "1";
      } catch {
        dismissed = false;
      }
      setShow(!dismissed && !readAlertPrefs(tenantId).enabled);
    };
    sync();
    window.addEventListener(ALERT_PREFS_EVENT, sync);
    return () => window.removeEventListener(ALERT_PREFS_EVENT, sync);
  }, [tenantId]);

  if (!show || !tenantId) return null;

  async function enable() {
    unlockAudio();
    if (notificationPermission() === "default") await requestNotificationPermission();
    writeAlertPrefs(tenantId as string, { ...readAlertPrefs(tenantId as string), enabled: true });
    playChime(false);
  }

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISSED, "1");
    } catch {
      // pas de stockage : l'invitation reviendra
    }
    setShow(false);
  }

  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-xl border border-azur-200 bg-azur-50 px-4 py-3 animate-fade-up ${className ?? ""}`}>
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-azur-gradient text-white shadow-soft">
        <BellRing className="size-4" aria-hidden="true" />
      </span>
      <p className="min-w-0 flex-1 text-sm text-ink">
        <span className="font-semibold">Ne ratez plus un rendez-vous :</span> activez la sonnerie des rendez-vous, rappels et livraisons.
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => void enable()}
          className="inline-flex h-10 items-center rounded-full bg-azur-600 px-4 text-sm font-semibold text-white shadow-soft transition-all hover:-translate-y-0.5 pointer-coarse:h-11"
        >
          Activer
        </button>
        <button type="button" onClick={dismiss} aria-label="Plus tard" className="grid size-10 place-items-center rounded-full text-ink-soft hover:bg-azur-100 pointer-coarse:size-11">
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
