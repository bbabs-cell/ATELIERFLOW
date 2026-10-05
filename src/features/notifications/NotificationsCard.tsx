"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Volume2 } from "lucide-react";
import { Button, Field, Select, Switch } from "@/ui";
import { LEAD_MINUTES_OPTIONS, type AlertPrefs } from "@/domain/notifications/alerts";
import { ALERT_PREFS_EVENT, readAlertPrefs, writeAlertPrefs } from "@/infrastructure/notifications/alertStore";
import { playChime, unlockAudio, vibrate } from "@/infrastructure/notifications/chime";
import {
  notificationPermission,
  requestNotificationPermission,
  showSystemNotification,
  type NotificationPermissionState,
} from "@/infrastructure/notifications/systemNotifications";

const LEAD_LABELS: Record<number, string> = { 0: "Pas d'alerte avant", 10: "10 minutes avant", 15: "15 minutes avant", 30: "30 minutes avant", 60: "1 heure avant", 120: "2 heures avant" };

/** Réglages des alertes sonores (propres à cet appareil). */
export function NotificationsCard({ tenantId, className }: { tenantId: string; className?: string }) {
  const [prefs, setPrefs] = useState<AlertPrefs>(() => readAlertPrefs(tenantId));
  const [permission, setPermission] = useState<NotificationPermissionState>("default");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => {
      setPrefs(readAlertPrefs(tenantId));
      setPermission(notificationPermission());
    };
    sync();
    window.addEventListener(ALERT_PREFS_EVENT, sync);
    return () => window.removeEventListener(ALERT_PREFS_EVENT, sync);
  }, [tenantId]);

  function save(next: AlertPrefs) {
    setPrefs(next);
    writeAlertPrefs(tenantId, next);
  }

  async function toggle(enabled: boolean) {
    unlockAudio();
    if (enabled && notificationPermission() === "default") setPermission(await requestNotificationPermission());
    save({ ...prefs, enabled });
    setMessage(enabled ? "Alertes activées sur cet appareil." : null);
  }

  async function test() {
    unlockAudio();
    const played = prefs.sound ? playChime(true) : false;
    vibrate(true);
    const shown = await showSystemNotification({ tag: "test", title: "Test de la sonnerie", body: "Les alertes de l'atelier fonctionnent sur cet appareil.", url: "/parametres", urgent: false });
    setMessage(
      [played || !prefs.sound ? null : "Son bloqué : touchez l'écran puis réessayez, et vérifiez le volume.", shown ? null : "Notification du téléphone non autorisée."].filter(Boolean).join(" ") ||
        "Vous devriez entendre la sonnerie et voir une notification.",
    );
  }

  return (
    <section className={`flex flex-col gap-4 rounded-xl border border-outline bg-surface p-4 shadow-soft ${className ?? ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-lg text-ink">
            {prefs.enabled ? <Bell className="size-5 text-azur-600" aria-hidden="true" /> : <BellOff className="size-5 text-ink-faint" aria-hidden="true" />}
            Alertes et sonnerie
          </h2>
          <p className="text-sm text-ink-soft">
            Rendez-vous qui approchent, rappels WhatsApp à envoyer, livraisons du jour et retards, stock bas. Réglage propre à cet appareil.
          </p>
        </div>
        <Switch className="w-14 shrink-0" checked={prefs.enabled} onChange={(e) => void toggle(e.target.checked)} aria-label="Activer les alertes" />
      </div>

      {prefs.enabled ? (
        <>
          <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2">
            <Field label="Avant un rendez-vous" htmlFor="alert-lead">
              <Select id="alert-lead" value={String(prefs.leadMinutes)} onChange={(e) => save({ ...prefs, leadMinutes: Number(e.target.value) })}>
                {[...LEAD_MINUTES_OPTIONS, 0].map((m) => (
                  <option key={m} value={m}>
                    {LEAD_LABELS[m]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Résumé du jour à partir de" htmlFor="alert-hour">
              <Select id="alert-hour" value={String(prefs.dailyHour)} onChange={(e) => save({ ...prefs, dailyHour: Number(e.target.value) })}>
                {[6, 7, 8, 9, 10, 12, 14].map((h) => (
                  <option key={h} value={h}>
                    {h} h
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-medium text-ink">
              <Switch className="w-14" checked={prefs.sound} onChange={(e) => save({ ...prefs, sound: e.target.checked })} aria-label="Sonnerie" />
              Sonnerie
            </div>
            <Button variant="outline" onClick={() => void test()}>
              <Volume2 className="size-4" aria-hidden="true" />
              Tester la sonnerie
            </Button>
          </div>
          {permission === "denied" ? (
            <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
              Les notifications sont bloquées pour ce site : autorisez-les dans les réglages du navigateur (icône à gauche de l&apos;adresse), la sonnerie fonctionne quand même dans l&apos;application.
            </p>
          ) : permission === "default" ? (
            <Button variant="ghost" onClick={async () => setPermission(await requestNotificationPermission())}>
              Autoriser les notifications du téléphone
            </Button>
          ) : null}
          <p className="text-xs text-ink-faint">
            L&apos;application doit être ouverte (ou en arrière-plan) pour sonner. Sur iPhone, installez-la d&apos;abord sur l&apos;écran d&apos;accueil.
          </p>
        </>
      ) : null}
      {message ? <p role="status" className="rounded-md bg-surface-2 px-3 py-2 text-sm text-ink-soft">{message}</p> : null}
    </section>
  );
}
