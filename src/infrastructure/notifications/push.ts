import type { AlertPrefs } from "@/domain/notifications/alerts";
import { getAccessToken, getSupabaseBrowserClient } from "@/infrastructure/supabase/browserClient";
import { getSupabaseBrowserEnv } from "@/infrastructure/supabase/env";

/**
 * Alertes « push » : le téléphone est abonné auprès de son service de
 * notifications (Google, Apple, Mozilla) avec la clé publique de
 * l'atelier ; la fonction Supabase « push-alerts » lui envoie les alertes
 * dues même application fermée (0028 + supabase/setup/push_cron.sql).
 */

export type PushState = "unsupported" | "denied" | "not-ready" | "subscribed" | "error";

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Abonne (ou met à jour) cet appareil avec les réglages d'alertes.
 * Demande l'autorisation si besoin : à appeler après un geste de l'utilisateur
 * la première fois.
 */
export async function subscribePush(prefs: AlertPrefs): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const client = getSupabaseBrowserClient();
  if (!client) return "not-ready";
  try {
    const { data: publicKey, error } = await client.rpc("push_public_key");
    if (error || typeof publicKey !== "string" || publicKey.length < 20) return "not-ready";
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      // Abonnement fait avec une autre clé : on le refait.
      const current = subscription.options.applicationServerKey;
      const expected = keyBytes(publicKey);
      const same = current && new Uint8Array(current).length === expected.length && new Uint8Array(current).every((b, i) => b === expected[i]);
      if (!same) {
        await subscription.unsubscribe().catch(() => undefined);
        subscription = null;
      }
    }
    subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return "error";
    const { error: saveError } = await client.rpc("register_push_subscription", {
      p_endpoint: json.endpoint,
      p_p256dh: json.keys.p256dh,
      p_auth: json.keys.auth,
      p_lead_minutes: prefs.leadMinutes,
      p_daily_hour: prefs.dailyHour,
      p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    return saveError ? "error" : "subscribed";
  } catch {
    // L'autorisation a pu être refusée pendant la demande.
    return (Notification.permission as NotificationPermission) === "denied" ? "denied" : "error";
  }
}

/** Désabonne cet appareil (alertes désactivées). */
export async function unsubscribePush(): Promise<void> {
  if (!pushSupported()) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;
    const client = getSupabaseBrowserClient();
    await client?.rpc("unregister_push_subscription", { p_endpoint: subscription.endpoint });
    await subscription.unsubscribe();
  } catch {
    // sans réseau : le serveur retirera l'abonnement à son premier échec d'envoi
  }
}

/** Notification de test envoyée par le serveur à tous les appareils de l'utilisateur. */
export async function sendTestPush(): Promise<{ sent: number } | null> {
  const env = getSupabaseBrowserEnv();
  const token = await getAccessToken();
  if (!env.provisioned || !token) return null;
  try {
    const response = await fetch(`${env.url}/functions/v1/push-alerts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, apikey: env.anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "test" }),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { sent?: number };
    return { sent: body.sent ?? 0 };
  } catch {
    return null;
  }
}
