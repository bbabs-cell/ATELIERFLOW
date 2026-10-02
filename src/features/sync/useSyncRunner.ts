"use client";

import { useEffect } from "react";
import { peekActiveSession } from "@/application/auth/session";
import { createPullService } from "@/application/sync/pullService";
import { getClientsFacade } from "@/features/clients/facade";
import { createOnlineDetector, isOnline } from "@/infrastructure/network/onlineDetector";
import { createIndexedDbCache } from "@/repository/local/indexeddb/cache";
import { getSupabaseBrowserClient } from "@/infrastructure/supabase/browserClient";
import { createLocalPullCursorStore, createSupabasePullRemote } from "@/infrastructure/sync/pullRemote";

/** Événement émis quand la récupération a modifié des données locales : les écrans se rechargent. */
export const DATA_CHANGED_EVENT = "atelier:data-changed";

/** Intervalle de secours : rattrape une opération restée en file (réseau instable). */
const SAFETY_INTERVAL_MS = 30_000;
/** Délai après une saisie : regroupe plusieurs opérations dans un même envoi. */
const AFTER_CHANGE_MS = 1_200;

/**
 * Synchronisation dans les deux sens : envoie la file locale (sync_push),
 * puis récupère ce qui a changé sur le serveur (autres appareils, équipe).
 * Au démarrage, au retour du réseau, au retour sur l'onglet, peu après
 * chaque saisie et toutes les 30 s. Hors ligne, rien n'est tenté ; le
 * moteur gère l'idempotence et les reprises (backoff).
 */
export function useSyncRunner(sessionKey: string | null): void {
  useEffect(() => {
    if (sessionKey === null) return;
    const engine = getClientsFacade().engine;
    const session = peekActiveSession();
    const client = getSupabaseBrowserClient();
    const puller =
      session && client
        ? createPullService({
            remote: createSupabasePullRemote(client),
            cache: createIndexedDbCache(session.tenantId),
            cursors: createLocalPullCursorStore(session.tenantId),
            unsettled: () => engine.unsettledKeys(),
          })
        : null;
    let running = false;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastPending = 0;

    const run = () => {
      if (stopped || running || !isOnline()) return;
      running = true;
      void (async () => {
        try {
          await engine.onOnline();
          const report = await puller?.pull();
          if (!stopped && report && report.changed > 0) window.dispatchEvent(new Event(DATA_CHANGED_EVENT));
        } catch {
          // réseau instable : nouvelle tentative au prochain déclencheur
        } finally {
          running = false;
        }
      })();
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
