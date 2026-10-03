"use client";

import { useEffect, useState } from "react";
import { BRANDING_URL_TTL_SECONDS, type BrandingUrls } from "@/domain/branding/branding";
import { peekActiveSession } from "@/application/auth/session";
import { fetchBranding } from "@/infrastructure/branding/brandingClient";

/**
 * Photo de profil, logo et couverture de la session. Les liens signés
 * (12 h) sont gardés en cache sur l'appareil : affichage immédiat, et une
 * seule requête tant qu'ils restent valides. Hors ligne, le navigateur
 * réutilise les images déjà chargées.
 */
export const BRANDING_CHANGED_EVENT = "atelier:branding-changed";
const PREFIX = "atelier.branding.";
/** Renouvelés bien avant leur expiration. */
const REFRESH_AFTER_MS = (BRANDING_URL_TTL_SECONDS * 1000) / 2;
const EMPTY: BrandingUrls = { avatar: null, logo: null, cover: null };

interface Cached {
  at: number;
  urls: BrandingUrls;
}

function cacheKey(): string | null {
  const s = peekActiveSession();
  return s && s.mode === "SUPABASE" ? `${PREFIX}${s.tenantId}.${s.profileId}` : null;
}

function readCache(key: string): Cached | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Cached) : null;
  } catch {
    return null;
  }
}

/** Après un envoi : met à jour le cache et prévient les composants affichés. */
export function setBrandingUrls(patch: Partial<BrandingUrls>): void {
  const key = cacheKey();
  if (!key) return;
  const current = readCache(key)?.urls ?? EMPTY;
  try {
    window.localStorage.setItem(key, JSON.stringify({ at: Date.now(), urls: { ...current, ...patch } }));
  } catch {
    // stockage indisponible
  }
  window.dispatchEvent(new Event(BRANDING_CHANGED_EVENT));
}

/** `sessionKey` : identifiant de la session prête (null tant qu'elle ne l'est pas). */
export function useBranding(sessionKey: string | null): BrandingUrls {
  const [urls, setUrls] = useState<BrandingUrls>(EMPTY);

  useEffect(() => {
    const key = sessionKey ? cacheKey() : null;
    if (!key) return;
    let cancelled = false;
    const fromCache = () => {
      const cached = readCache(key);
      if (cached && !cancelled) setUrls(cached.urls);
      return cached;
    };
    const cached = readCache(key);
    void Promise.resolve().then(fromCache);
    if (!cached || Date.now() - cached.at > REFRESH_AFTER_MS) {
      void fetchBranding()
        .then((fresh) => {
          if (cancelled) return;
          try {
            window.localStorage.setItem(key, JSON.stringify({ at: Date.now(), urls: fresh }));
          } catch {
            // stockage indisponible
          }
          setUrls(fresh);
        })
        .catch(() => undefined);
    }
    window.addEventListener(BRANDING_CHANGED_EVENT, fromCache);
    return () => {
      cancelled = true;
      window.removeEventListener(BRANDING_CHANGED_EVENT, fromCache);
    };
  }, [sessionKey]);

  return sessionKey ? urls : EMPTY;
}
