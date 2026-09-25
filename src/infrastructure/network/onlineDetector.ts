export function createOnlineDetector(
  handlers: { onOnline: () => void; onOffline: () => void },
): () => void {
  if (
    typeof globalThis.window === "undefined" ||
    typeof window.addEventListener !== "function" ||
    typeof navigator.onLine === "undefined"
  ) {
    return () => undefined;
  }

  const onOnlineEvent = () => handlers.onOnline();
  const onOfflineEvent = () => handlers.onOffline();

  window.addEventListener("online", onOnlineEvent);
  window.addEventListener("offline", onOfflineEvent);

  return () => {
    window.removeEventListener("online", onOnlineEvent);
    window.removeEventListener("offline", onOfflineEvent);
  };
}

export function isOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine !== false;
}