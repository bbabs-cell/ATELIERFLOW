"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { peekActiveSession } from "@/application/auth/session";
import {
  parseEntitlements,
  serializeEntitlements,
  type Entitlements,
} from "@/domain/subscriptions/entitlements";
import { isOnline } from "@/infrastructure/network/onlineDetector";
import { getSupabaseBrowserClient } from "@/infrastructure/supabase/browserClient";
import { createSubscriptionRemote } from "@/infrastructure/subscriptions/subscriptionRemote";
import { DATA_CHANGED_EVENT } from "@/features/sync/useSyncRunner";

/**
 * Droits de l'atelier courant, partagés par tous les écrans.
 * Lus sur le serveur (my_entitlements) et gardés en cache local
 * (atelier.entitlements.<atelier>) pour prévenir aussi hors ligne.
 * null : inconnus (mode démo, premier lancement hors ligne) → rien n'est
 * bloqué côté interface, le serveur tranchera.
 */
const CACHE_PREFIX = "atelier.entitlements.";
const MIN_REFRESH_MS = 5_000;

interface State {
  tenantId: string | null;
  value: Entitlements | null;
  loadedAt: number;
}

let state: State = { tenantId: null, value: null, loadedAt: 0 };
let inFlight: Promise<Entitlements | null> | null = null;
const listeners = new Set<() => void>();

function emit(next: State): void {
  state = next;
  for (const listener of listeners) listener();
}

function readCache(tenantId: string): Entitlements | null {
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + tenantId);
    return raw ? parseEntitlements(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writeCache(tenantId: string, value: Entitlements): void {
  try {
    window.localStorage.setItem(CACHE_PREFIX + tenantId, JSON.stringify(serializeEntitlements(value)));
  } catch {
    // stockage indisponible : le cache n'est qu'une commodité
  }
}

function currentTenant(): string | null {
  const session = peekActiveSession();
  return session && session.mode !== "DEMO" ? session.tenantId : null;
}

/** Aligne l'état partagé sur l'atelier de la session (cache local d'abord). */
function syncTenant(): void {
  const tenantId = currentTenant();
  if (tenantId === state.tenantId) return;
  emit({ tenantId, value: tenantId ? readCache(tenantId) : null, loadedAt: 0 });
}

/** Remplace les droits connus (après une réponse du serveur). */
export function setEntitlements(value: Entitlements): void {
  const tenantId = currentTenant();
  if (!tenantId) return;
  writeCache(tenantId, value);
  emit({ tenantId, value, loadedAt: Date.now() });
}

export async function refreshEntitlements(force = false): Promise<Entitlements | null> {
  syncTenant();
  const tenantId = state.tenantId;
  const client = getSupabaseBrowserClient();
  const session = peekActiveSession();
  if (!tenantId || !client || session?.mode !== "SUPABASE" || !isOnline()) return state.value;
  if (!force && Date.now() - state.loadedAt < MIN_REFRESH_MS) return state.value;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const value = await createSubscriptionRemote(client).myEntitlements();
      if (currentTenant() === tenantId) setEntitlements(value);
      return value;
    } catch {
      return state.value;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot(): Entitlements | null {
  return state.value;
}

function serverSnapshot(): Entitlements | null {
  return null;
}

export function useEntitlements(): { entitlements: Entitlements | null; refresh: () => Promise<Entitlements | null> } {
  const entitlements = useSyncExternalStore(subscribe, snapshot, serverSnapshot);

  useEffect(() => {
    syncTenant();
    void refreshEntitlements();
    const onChange = () => void refreshEntitlements();
    window.addEventListener(DATA_CHANGED_EVENT, onChange);
    window.addEventListener("online", onChange);
    return () => {
      window.removeEventListener(DATA_CHANGED_EVENT, onChange);
      window.removeEventListener("online", onChange);
    };
  }, []);

  const refresh = useCallback(() => refreshEntitlements(true), []);
  return { entitlements, refresh };
}
