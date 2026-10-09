"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { peekActiveSession } from "@/application/auth/session";
import { computeAlerts, pendingAlerts, type AtelierAlert } from "@/domain/notifications/alerts";
import { getDashboardFacade } from "@/features/dashboard/facade";
import { DATA_CHANGED_EVENT } from "@/features/sync/useSyncRunner";
import { playChime, unlockAudio, vibrate } from "@/infrastructure/notifications/chime";
import { showSystemNotification } from "@/infrastructure/notifications/systemNotifications";
import { ALERT_PREFS_EVENT, readAlertPrefs, readPlayed, writePlayed } from "@/infrastructure/notifications/alertStore";
import { subscribePush, unsubscribePush } from "@/infrastructure/notifications/push";

/** Vérification régulière : un rendez-vous à 30 min sonne à la minute près. */
const CHECK_INTERVAL_MS = 30_000;

/**
 * Surveille rendez-vous, rappels, livraisons et stock pendant que
 * l'application est ouverte (ou en arrière-plan récent) : sonnerie,
 * vibration, notification du système et bandeau dans l'application.
 * Renvoie les alertes affichées dans l'application.
 */
export function useAlertRunner(sessionKey: string | null): { alerts: AtelierAlert[]; dismiss: (key: string) => void } {
  const [alerts, setAlerts] = useState<AtelierAlert[]>([]);
  const running = useRef(false);

  const dismiss = useCallback((key: string) => setAlerts((list) => list.filter((a) => a.key !== key)), []);

  useEffect(() => {
    if (sessionKey === null) return;
    // Le son n'est autorisé qu'après un geste : on le débloque au premier toucher.
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);

    const check = async () => {
      const session = peekActiveSession();
      if (!session || running.current) return;
      const prefs = readAlertPrefs(session.tenantId);
      if (!prefs.enabled) return;
      running.current = true;
      try {
        const sources = await getDashboardFacade().dashboard.getAssistantSources();
        const now = new Date().toISOString();
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const played = readPlayed(session.tenantId);
        const due = pendingAlerts(
          computeAlerts(
            {
              now,
              timeZone,
              permissions: new Set(sources.permissions),
              appointments: sources.appointments,
              customers: sources.customers,
              orders: sources.orders,
              fabrics: sources.fabrics,
            },
            prefs,
          ),
          played,
        );
        if (due.length === 0) return;
        const urgent = due.some((a) => a.urgent);
        if (prefs.sound) playChime(urgent);
        vibrate(urgent);
        for (const alert of due) {
          played.add(alert.key);
          void showSystemNotification({ tag: alert.key, title: alert.title, body: alert.body, url: alert.url, urgent: alert.urgent });
        }
        writePlayed(session.tenantId, played, now.slice(0, 10));
        setAlerts((list) => [...due, ...list.filter((a) => !due.some((d) => d.key === a.key))].slice(0, 4));
      } catch {
        // données locales momentanément illisibles : nouvel essai au prochain passage
      } finally {
        running.current = false;
      }
    };

    // Abonnement push (application fermée) aligné sur les réglages : mis à
    // jour au démarrage et à chaque changement, seulement si le téléphone a
    // déjà autorisé les notifications (la demande se fait sur un geste).
    const syncPush = () => {
      const session = peekActiveSession();
      if (session?.mode !== "SUPABASE" || typeof Notification === "undefined") return;
      const prefs = readAlertPrefs(session.tenantId);
      if (prefs.enabled && Notification.permission === "granted") void subscribePush(prefs);
      else if (!prefs.enabled) void unsubscribePush();
    };
    syncPush();
    window.addEventListener(ALERT_PREFS_EVENT, syncPush);

    const timer = window.setInterval(() => void check(), CHECK_INTERVAL_MS);
    const soon = window.setTimeout(() => void check(), 2_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    const onChange = () => void check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(DATA_CHANGED_EVENT, onChange);
    window.addEventListener(ALERT_PREFS_EVENT, onChange);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(soon);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(DATA_CHANGED_EVENT, onChange);
      window.removeEventListener(ALERT_PREFS_EVENT, onChange);
      window.removeEventListener(ALERT_PREFS_EVENT, syncPush);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [sessionKey]);

  return { alerts, dismiss };
}
