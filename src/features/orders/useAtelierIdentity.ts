"use client";

import { useEffect, useState } from "react";
import { peekActiveSession } from "@/application/auth/session";
import type { AtelierIdentity } from "@/domain/orders/receiptDocument";
import { can, TENANT_ROLE_CODES, type TenantRoleCode } from "@/domain/team/roles";
import { getSupabaseBrowserClient } from "@/infrastructure/supabase/browserClient";
import { createAtelierIdentityRemote, readCachedIdentity, writeCachedIdentity } from "@/infrastructure/tenant/atelierIdentity";

const DEMO_IDENTITY: AtelierIdentity = {
  name: "Atelier démo",
  phone: null,
  address: null,
  footer: null,
};

function canEditSettings(role: string | null): boolean {
  return role !== null && (TENANT_ROLE_CODES as readonly string[]).includes(role) && can(role as TenantRoleCode, "tenant.settings");
}

/**
 * Coordonnées de l'atelier pour les reçus : copie locale immédiate (hors
 * connexion), rafraîchie depuis Supabase quand c'est possible.
 */
export function useAtelierIdentity() {
  const session = peekActiveSession();
  const tenantId = session?.tenantId ?? null;
  const demo = session?.mode === "DEMO";
  const [identity, setIdentity] = useState<AtelierIdentity | null>(() =>
    tenantId ? (readCachedIdentity(tenantId) ?? (demo ? DEMO_IDENTITY : null)) : null,
  );

  useEffect(() => {
    if (!tenantId || demo) return;
    const client = getSupabaseBrowserClient();
    if (!client) return;
    let cancelled = false;
    void (async () => {
      try {
        const fresh = await createAtelierIdentityRemote(client, tenantId).load();
        if (!cancelled) setIdentity(fresh);
      } catch {
        // hors connexion : la copie locale reste valable
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId, demo]);

  async function save(next: AtelierIdentity): Promise<void> {
    if (!tenantId) throw new Error("NO_ACTIVE_SESSION");
    if (demo) {
      writeCachedIdentity(tenantId, next);
      setIdentity(next);
      return;
    }
    const client = getSupabaseBrowserClient();
    if (!client) throw new Error("OFFLINE");
    setIdentity(await createAtelierIdentityRemote(client, tenantId).save(next));
  }

  return {
    /** null : coordonnées jamais chargées sur cet appareil (premier usage hors ligne). */
    identity,
    canEdit: demo || canEditSettings(session?.role ?? null),
    save,
  };
}
