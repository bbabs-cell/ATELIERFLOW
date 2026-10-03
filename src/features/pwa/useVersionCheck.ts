"use client";

import { useEffect, useState } from "react";

/** Identifiant de build embarqué dans ce code (fixé par next.config). */
export const CURRENT_BUILD = process.env.NEXT_PUBLIC_BUILD_ID ?? null;
const CHECK_EVERY_MS = 10 * 60 * 1000;

async function fetchDeployedBuild(): Promise<string | null> {
  try {
    const response = await fetch("/api/version", { cache: "no-store" });
    if (!response.ok) return null;
    const body = (await response.json()) as { build?: unknown };
    return typeof body.build === "string" && body.build.length > 0 ? body.build : null;
  } catch {
    return null;
  }
}

/**
 * Nouvelle version en ligne ? Vérifié au retour sur l'application, au
 * retour du réseau et toutes les 10 minutes. Au retour sur l'application
 * (rien n'est en cours de saisie), on recharge directement : les données
 * locales et la file de synchronisation sont dans IndexedDB, rien n'est
 * perdu. Sinon, on propose la mise à jour.
 */
export function useVersionCheck(): { updateAvailable: boolean; dismiss: () => void } {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    if (!CURRENT_BUILD) return;
    let stopped = false;

    const check = async (reloadIfNew: boolean) => {
      if (stopped || !navigator.onLine) return;
      const deployed = await fetchDeployedBuild();
      if (stopped || !deployed || deployed === CURRENT_BUILD) return;
      if (reloadIfNew) window.location.reload();
      else setUpdateAvailable(true);
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void check(true);
    };
    const onOnline = () => void check(false);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    const interval = setInterval(() => void check(false), CHECK_EVERY_MS);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      clearInterval(interval);
    };
  }, []);

  return { updateAvailable, dismiss: () => setUpdateAvailable(false) };
}
