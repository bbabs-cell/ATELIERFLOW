"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Smartphone, Volume2 } from "lucide-react";
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
import { pushSupported, sendTestPush, subscribePush, type PushState } from "@/infrastructure/notifications/push";
import { peekActiveSession } from "@/application/auth/session";

const PUSH_LABELS: Record<PushState | "checking", string> = {
  checking: "Vérification…",
  subscribed: "Actives : le téléphone sonne même application fermée.",
  "not-ready": "Bientôt prêtes (le serveur prépare les clés) : réessayez dans une minute.",
  denied: "Bloquées : autorisez les notifications pour ce site dans le navigateur.",
  unsupported: "Non disponibles sur ce navigateur. Sur iPhone : installez l'application sur l'écran d'accueil (iOS 16.4 ou plus).",
  error: "Abonnement impossible pour le moment : vérifiez la connexion puis réessayez.",
};

const LEAD_LABELS: Record<number, string> = { 0: "Pas d'alerte avant", 10: "10 minutes avant", 15: "15 minutes avant", 30: "30 minutes avant", 60: "1 heure avant", 120: "2 heures avant" };

/** Réglages des alertes sonores (propres à cet appareil). */
export function NotificationsCard({ tenantId, className }: { tenantId: string; className?: string }) {
  const [prefs, setPrefs] = useState<AlertPrefs>(() => readAlertPrefs(tenantId));
  const [permission, setPermission] = useState<NotificationPermissionState>("default");
  const [message, setMessage] = useState<string | null>(null);
  const online = peekActiveSession()?.mode === "SUPABASE";
  const [push, setPush] = useState<PushState | "checking" | null>(null);

  async function refreshPush(next: AlertPrefs) {
    if (!online || !next.enabled) {
      setPush(null);
      return;
    }
    if (!pushSupported()) {
      setPush("unsupported");
      return;
    }
    setPush("checking");
    setPush(await subscribePush(next));
  }

  useEffect(() => {
    const sync = () => {
      setPrefs(readAlertPrefs(tenantId));
      setPermission(notificationPermission());
    };
    sync();
    const initial = readAlertPrefs(tenantId);
    void (async () => {
      if (!initial.enabled || !online) return;
      if (!pushSupported()) setPush("unsupported");
      else if (notificationPermission() === "granted") setPush(await subscribePush(initial));
    })();
    window.addEventListener(ALERT_PREFS_EVENT, sync);
    return () => window.removeEventListener(ALERT_PREFS_EVENT, sync);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- vérification de l'abonnement à l'ouverture
  }, [tenantId]);

  function save(next: AlertPrefs) {
    setPrefs(next);
    writeAlertPrefs(tenantId, next);
  }

  async function toggle(enabled: boolean) {
    unlockAudio();
    if (enabled && notificationPermission() === "default") setPermission(await requestNotificationPermission());
    const next = { ...prefs, enabled };
    save(next);
    setMessage(enabled ? "Alertes activées sur cet appareil." : null);
    await refreshPush(next);
  }

  async function testPush() {
    setMessage("Envoi d'une notification de test depuis le serveur… Vous pouvez verrouiller le téléphone.");
    const result = await sendTestPush();
    setMessage(
      result === null
        ? "Le test n'a pas pu partir : vérifiez la connexion."
        : result.sent > 0
          ? "Notification envoyée : elle arrive dans quelques secondes, même application fermée."
          : "Aucun appareil abonné : activez les alertes sur ce téléphone puis réessayez.",
    );
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
              <Select id="alert-lead" value={String(prefs.leadMinutes)} onChange={(e) => {
                const next = { ...prefs, leadMinutes: Number(e.target.value) };
                save(next);
                void refreshPush(next);
              }}>
                {[...LEAD_MINUTES_OPTIONS, 0].map((m) => (
                  <option key={m} value={m}>
                    {LEAD_LABELS[m]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Résumé du jour à partir de" htmlFor="alert-hour">
              <Select id="alert-hour" value={String(prefs.dailyHour)} onChange={(e) => {
                const next = { ...prefs, dailyHour: Number(e.target.value) };
                save(next);
                void refreshPush(next);
              }}>
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
          {online && push ? (
            <div className="flex flex-col gap-2 rounded-lg border border-outline bg-surface-2 p-3">
              <p className="flex items-start gap-2 text-sm text-ink">
                <Smartphone className="mt-0.5 size-4 shrink-0 text-azur-600" aria-hidden="true" />
                <span>
                  <span className="font-semibold">Application fermée : </span>
                  {PUSH_LABELS[push]}
                </span>
              </p>
              {push === "subscribed" ? (
                <Button variant="ghost" size="sm" onClick={() => void testPush()} className="self-start">
                  Envoyer une notification de test au téléphone
                </Button>
              ) : push !== "checking" && push !== "unsupported" ? (
                <Button variant="ghost" size="sm" onClick={() => void refreshPush(prefs)} className="self-start">
                  Réessayer
                </Button>
              ) : null}
            </div>
          ) : null}
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
            Application ouverte : sonnerie de l&apos;atelier. Application fermée : notification avec la sonnerie du téléphone. Sur iPhone, installez d&apos;abord l&apos;application sur l&apos;écran d&apos;accueil.
          </p>
        </>
      ) : null}
      {message ? <p role="status" className="rounded-md bg-surface-2 px-3 py-2 text-sm text-ink-soft">{message}</p> : null}
    </section>
  );
}
