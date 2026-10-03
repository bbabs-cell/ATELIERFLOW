"use client";

import { useEffect, useState } from "react";
import { PEGGED_RATES, sanitizeRates, type Rates } from "@/domain/geo/exchange";

const KEY = "atelier.rates";
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

/** Taux du jour (cache de l'appareil 12 h) ; parités fixes en attendant ou hors ligne. */
export function useRates(): Rates {
  const [rates, setRates] = useState<Rates>(PEGGED_RATES);

  useEffect(() => {
    let cancelled = false;
    let cached: { at: number; rates: Rates } | null = null;
    try {
      const raw = window.localStorage.getItem(KEY);
      cached = raw ? (JSON.parse(raw) as { at: number; rates: Rates }) : null;
    } catch {
      cached = null;
    }
    if (cached) {
      const fromCache = sanitizeRates(cached.rates);
      void Promise.resolve().then(() => !cancelled && setRates(fromCache));
    }
    if (!cached || Date.now() - cached.at > MAX_AGE_MS) {
      void fetch("/api/rates")
        .then((r) => (r.ok ? r.json() : null))
        .then((body: { rates?: unknown } | null) => {
          if (cancelled || !body) return;
          const fresh = sanitizeRates(body.rates);
          setRates(fresh);
          try {
            window.localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), rates: fresh }));
          } catch {
            // stockage indisponible
          }
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, []);

  return rates;
}
