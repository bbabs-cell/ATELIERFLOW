/**
 * Notifications du système (barre de notifications du téléphone, centre de
 * notifications de l'ordinateur), via le service worker quand il est là
 * (obligatoire sur Android), sinon via l'API Notification.
 */

export type NotificationPermissionState = "granted" | "denied" | "default" | "unsupported";

export function notificationPermission(): NotificationPermissionState {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (notificationPermission() === "unsupported") return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return notificationPermission();
  }
}

export interface SystemNotification {
  tag: string;
  title: string;
  body: string;
  url: string;
  urgent: boolean;
}

export async function showSystemNotification(n: SystemNotification): Promise<boolean> {
  if (notificationPermission() !== "granted") return false;
  const options: NotificationOptions & { vibrate?: number[]; renotify?: boolean } = {
    body: n.body,
    tag: n.tag,
    icon: "/pwa/icon.svg",
    badge: "/pwa/icon.svg",
    data: { url: n.url },
    requireInteraction: n.urgent,
    renotify: true,
    vibrate: n.urgent ? [400, 150, 400, 150, 400] : [250, 120, 250],
  };
  try {
    const registration = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (registration) {
      await registration.showNotification(n.title, options);
      return true;
    }
    const notification = new Notification(n.title, options);
    notification.onclick = () => {
      window.focus();
      window.location.assign(n.url);
      notification.close();
    };
    return true;
  } catch {
    return false;
  }
}
