import { normalizePrefs, prunePlayed, type AlertPrefs } from "@/domain/notifications/alerts";

/** Réglages et alertes déjà jouées, propres à cet appareil et à cet atelier. */
const PREFS = "atelier.alerts.prefs.";
const PLAYED = "atelier.alerts.played.";
export const ALERT_PREFS_EVENT = "atelier:alert-prefs";

export function readAlertPrefs(tenantId: string): AlertPrefs {
  try {
    return normalizePrefs(JSON.parse(window.localStorage.getItem(PREFS + tenantId) ?? "null"));
  } catch {
    return normalizePrefs(null);
  }
}

export function writeAlertPrefs(tenantId: string, prefs: AlertPrefs): void {
  try {
    window.localStorage.setItem(PREFS + tenantId, JSON.stringify(prefs));
  } catch {
    // stockage indisponible : réglage gardé pour cette visite seulement
  }
  window.dispatchEvent(new Event(ALERT_PREFS_EVENT));
}

export function readPlayed(tenantId: string): Set<string> {
  try {
    const list = JSON.parse(window.localStorage.getItem(PLAYED + tenantId) ?? "[]") as unknown;
    return new Set(Array.isArray(list) ? list.filter((k): k is string => typeof k === "string") : []);
  } catch {
    return new Set();
  }
}

export function writePlayed(tenantId: string, keys: Iterable<string>, today: string): void {
  try {
    window.localStorage.setItem(PLAYED + tenantId, JSON.stringify(prunePlayed([...keys], today)));
  } catch {
    // sans stockage, une alerte pourrait rejouer au prochain chargement
  }
}
