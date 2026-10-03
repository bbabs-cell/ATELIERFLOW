"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/infrastructure/supabase/browserClient";
import { createPlatformRemote } from "@/infrastructure/subscriptions/subscriptionRemote";

/**
 * Le compte est-il administrateur de la plateforme (SAAS_ADMIN) ?
 * Sert uniquement à afficher le menu : chaque RPC d'administration
 * revérifie le rôle côté base.
 */
const CACHE_KEY = "atelier.platformAdmin";

export function usePlatformAdmin(enabled: boolean): boolean {
  const [admin, setAdmin] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    try {
      if (window.sessionStorage.getItem(CACHE_KEY) === "1") void Promise.resolve().then(() => !cancelled && setAdmin(true));
    } catch {
      // stockage indisponible
    }
    const client = getSupabaseBrowserClient();
    if (!client) return;
    void createPlatformRemote(client)
      .isAdmin()
      .then((value) => {
        if (cancelled) return;
        setAdmin(value);
        try {
          window.sessionStorage.setItem(CACHE_KEY, value ? "1" : "0");
        } catch {
          // stockage indisponible
        }
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return enabled && admin;
}
