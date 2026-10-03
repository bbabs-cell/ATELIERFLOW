"use client";

import { useEffect, useState } from "react";
import { CURRENCY, setActiveCurrency } from "@/domain/money";
import { getSupabaseBrowserClient } from "@/infrastructure/supabase/browserClient";

/**
 * Pays et monnaie de l'atelier (0026). Gardés sur l'appareil pour afficher
 * les montants dans la bonne monnaie dès l'ouverture, même hors ligne ;
 * relus sur le serveur à chaque ouverture en ligne.
 */
export interface TenantLocale {
  countryCode: string | null;
  currency: string;
  /** Une commande ou un paiement existe : la monnaie ne peut plus changer. */
  locked: boolean;
}

const PREFIX = "atelier.locale.";
export const LOCALE_CHANGED_EVENT = "atelier:locale-changed";
export const DEFAULT_LOCALE: TenantLocale = { countryCode: null, currency: CURRENCY, locked: false };

export function readCachedLocale(tenantId: string): TenantLocale | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + tenantId);
    return raw ? (JSON.parse(raw) as TenantLocale) : null;
  } catch {
    return null;
  }
}

export function writeCachedLocale(tenantId: string, locale: TenantLocale): void {
  try {
    window.localStorage.setItem(PREFIX + tenantId, JSON.stringify(locale));
  } catch {
    // stockage indisponible : la monnaie sera relue au prochain chargement
  }
}

function parse(data: unknown): TenantLocale {
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    countryCode: typeof row.country_code === "string" ? row.country_code : null,
    currency: typeof row.currency === "string" ? row.currency : CURRENCY,
    locked: row.locked === true,
  };
}

/**
 * Monnaie de la session : posée immédiatement depuis le cache, puis
 * rafraîchie depuis le serveur. Le retour change quand la monnaie change,
 * pour que les écrans se redessinent.
 */
export function useTenantLocale(tenantId: string | null, online: boolean): TenantLocale {
  const [locale, setLocale] = useState<TenantLocale>(DEFAULT_LOCALE);

  useEffect(() => {
    if (!tenantId) {
      setActiveCurrency(CURRENCY);
      return;
    }
    let cancelled = false;
    const cached = readCachedLocale(tenantId) ?? DEFAULT_LOCALE;
    setActiveCurrency(cached.currency);
    void Promise.resolve().then(() => !cancelled && setLocale(cached));
    const client = getSupabaseBrowserClient();
    if (online && client) {
      void client.rpc("my_tenant_locale").then(({ data, error }) => {
        if (cancelled || error) return;
        const fresh = parse(data);
        writeCachedLocale(tenantId, fresh);
        setActiveCurrency(fresh.currency);
        setLocale(fresh);
      });
    }
    const onChanged = () => {
      const next = readCachedLocale(tenantId);
      if (next && !cancelled) setLocale(next);
    };
    window.addEventListener(LOCALE_CHANGED_EVENT, onChanged);
    return () => {
      cancelled = true;
      window.removeEventListener(LOCALE_CHANGED_EVENT, onChanged);
    };
  }, [tenantId, online]);

  return locale;
}

/** Enregistre pays et monnaie de l'atelier (propriétaire) ; renvoie un code d'erreur ou null. */
export async function saveTenantLocale(tenantId: string, countryCode: string, currency: string): Promise<string | null> {
  const client = getSupabaseBrowserClient();
  if (!client) return "OFFLINE";
  const { data, error } = await client.rpc("set_tenant_locale", { p_country: countryCode, p_currency: currency });
  if (error) {
    const match = /(CURRENCY_LOCKED|FORBIDDEN:[\w.]+|VALIDATION:\w+)/.exec(error.message);
    return match ? match[1] : "ERROR";
  }
  const saved = parse({ ...(data as object), locked: readCachedLocale(tenantId)?.locked ?? false });
  writeCachedLocale(tenantId, saved);
  setActiveCurrency(saved.currency);
  window.dispatchEvent(new Event(LOCALE_CHANGED_EVENT));
  return null;
}
