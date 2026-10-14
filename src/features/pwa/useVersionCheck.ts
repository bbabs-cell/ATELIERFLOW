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
 * retour du réseau et toutes les 10 minutes. Le rechargement se fait quand
 * l'application passe en arrière-plan : invisible pour la personne. Recharger
 * au retour sur l'application donnait un écran blanc au moment même où on
 * l'ouvrait. Les données locales et la file de synchronisation sont dans
 * IndexedDB : rien n'est perdu. En cours d'utilisation, la mise à jour est
 * proposée (bandeau).
 */
export function useVersionCheck(): { updateAvailable: boolean; dismiss: () => void } {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    if (!CURRENT_BUILD) return;
    let stopped = false;
    let pending = false;

    const check = async (fromReturn: boolean) => {
      if (stopped || !navigator.onLine) return;
      const deployed = await fetchDeployedBuild();
      if (stopped || !deployed || deployed === CURRENT_BUILD) return;
      pending = true;
      if (!fromReturn) setUpdateAvailable(true);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") void check(true);
      else if (pending) window.location.reload();
    };
    const onOnline = () => void check(false);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    const interval = setInterval(() => void check(false), CHECK_EVERY_MS);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      clearInterval(interval);
    };
  }, []);

  return { updateAvailable, dismiss: () => setUpdateAvailable(false) };
}
