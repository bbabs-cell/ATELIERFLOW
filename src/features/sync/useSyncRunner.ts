"use client";

import { useEffect } from "react";
import { getClientsFacade } from "@/features/clients/facade";
import { createOnlineDetector, isOnline } from "@/infrastructure/network/onlineDetector";

/** Intervalle de secours : rattrape une opération restée en file (réseau instable). */
const SAFETY_INTERVAL_MS = 30_000;
/** Délai après une saisie : regroupe plusieurs opérations dans un même envoi. */
const AFTER_CHANGE_MS = 1_200;

/**
 * Déclenche l'envoi de la file de synchronisation vers le serveur :
 * au démarrage, au retour du réseau, au retour sur l'onglet, peu après
 * chaque saisie et toutes les 30 s. Sans lui, les opérations restaient
 * indéfiniment sur l'appareil. Hors ligne, rien n'est tenté ; le moteur
 * gère lui-même l'idempotence et les reprises (backoff).
 */
export function useSyncRunner(sessionKey: string | null): void {
  useEffect(() => {
    if (sessionKey === null) return;
    const engine = getClientsFacade().engine;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastPending = 0;

    const run = () => {
      if (stopped || !isOnline()) return;
      void engine.onOnline().catch(() => undefined);
    };
    const schedule = (ms: number) => {
      clearTimeout(timer);
      timer = setTimeout(run, ms);
    };

    schedule(400);
    const unsubscribe = engine.subscribe((status) => {
      // Seulement quand de nouvelles opérations arrivent : pas de boucle sur un échec.
      if (status.pending > lastPending && !status.busy) schedule(AFTER_CHANGE_MS);
      lastPending = status.pending;
    });
    const stopDetector = createOnlineDetector({ onOnline: () => schedule(300), onOffline: () => clearTimeout(timer) });
    const interval = setInterval(run, SAFETY_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") schedule(300);
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      stopped = true;
      clearTimeout(timer);
      clearInterval(interval);
      unsubscribe();
      stopDetector();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [sessionKey]);
}
