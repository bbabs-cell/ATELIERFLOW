"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import {
  CalendarDays,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Shirt,
  Users,
  UsersRound,
} from "lucide-react";
import { AppShell, Badge, Button, StateView, type NavItem } from "@/ui";
import {
  clearActiveSession,
  demoSession,
  setActiveSession,
  type ActiveSession,
} from "@/application/auth/session";
import { resolveIdentity } from "@/domain/auth/claims";
import { getSupabaseBrowserClient } from "@/infrastructure/supabase/browserClient";
import {
  clearLastIdentity,
  loadLastIdentity,
  saveLastIdentity,
} from "@/infrastructure/auth/lastIdentity";

/** Pages accessibles sans atelier actif. */
const PUBLIC_PATHS = ["/connexion", "/bienvenue", "/offline", "/design"];

const NAV: Omit<NavItem, "active">[] = [
  { label: "Tableau de bord", href: "/dashboard", icon: LayoutDashboard },
  { label: "Clients", href: "/clients", icon: Users },
  { label: "Commandes", href: "/commandes", icon: ClipboardList },
  { label: "Rendez-vous", href: "/rdv", icon: CalendarDays },
  { label: "Stock", href: "/stock", icon: Shirt },
  { label: "Équipe", href: "/equipe", icon: UsersRound },
  { label: "Abonnement", href: "/abonnement", icon: CreditCard },
];
/** Pages qui n'ont plus de raison d'être une fois l'atelier prêt. */
const ENTRY_PATHS = ["/connexion", "/bienvenue"];
const HOME_PATH = "/dashboard";

type GateState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "needs-workspace" }
  | { status: "ready"; session: ActiveSession };

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/**
 * Barrière d'authentification (phase 10).
 *
 * Pose la session active (tenant issu du claim JWT `tenant_id`) avant tout
 * rendu d'écran métier : aucune facade ne peut être créée sans elle.
 *   - Supabase non provisionné  -> mode DEMO local explicite.
 *   - Session + claim tenant    -> application.
 *   - Session sans claim        -> /bienvenue (création de l'atelier).
 *   - Pas de session, hors ligne, identité connue -> mode OFFLINE (local).
 *   - Pas de session            -> /connexion.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const [state, setState] = useState<GateState>({ status: "loading" });

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (supabase === null) {
      // Résolu après le premier rendu, comme la session Supabase (asynchrone).
      void Promise.resolve().then(() => {
        const session = demoSession();
        setActiveSession(session);
        setState({ status: "ready", session });
      });
      return;
    }

    let cancelled = false;
    const apply = (session: Session | null) => {
      if (cancelled) return;
      if (session) {
        const identity = resolveIdentity(session.access_token);
        if (identity.kind === "READY") {
          const active: ActiveSession = {
            tenantId: identity.tenantId,
            profileId: identity.profileId,
            email: identity.email,
            role: identity.role,
            mode: "SUPABASE",
          };
          setActiveSession(active);
          saveLastIdentity(active);
          setState({ status: "ready", session: active });
          return;
        }
        clearActiveSession();
        setState({ status: identity.kind === "NEEDS_WORKSPACE" ? "needs-workspace" : "anonymous" });
        return;
      }
      const last = isOffline() ? loadLastIdentity() : null;
      if (last) {
        const active: ActiveSession = { ...last, mode: "OFFLINE" };
        setActiveSession(active);
        setState({ status: "ready", session: active });
        return;
      }
      clearActiveSession();
      setState({ status: "anonymous" });
    };

    void supabase.auth.getSession().then(({ data }) => apply(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => apply(session));
    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, []);

  const isPublic = PUBLIC_PATHS.includes(pathname);
  const target =
    state.status === "anonymous" && !isPublic
      ? "/connexion"
      : state.status === "needs-workspace" && pathname !== "/bienvenue"
        ? "/bienvenue"
        : state.status === "ready" && state.session.mode !== "DEMO" && ENTRY_PATHS.includes(pathname)
          ? HOME_PATH
          : null;

  useEffect(() => {
    if (target) router.replace(target);
  }, [router, target]);

  if (isPublic && target === null) {
    return <>{children}</>;
  }
  if (state.status !== "ready" || target !== null) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-md items-center px-4">
        <StateView variant="loading" title="Ouverture de l'atelier…" className="w-full" />
      </div>
    );
  }
  const navItems: NavItem[] = NAV.map((item) => ({
    ...item,
    active: pathname === item.href || pathname.startsWith(`${item.href}/`),
  }));
  return (
    <>
      {state.session.mode === "DEMO" ? <DemoBanner /> : null}
      <AppShell
        brand={<span className="font-display text-2xl italic text-chocolat-800">Atelier</span>}
        navItems={navItems}
      >
        {state.session.mode === "DEMO" ? null : <AccountBar session={state.session} />}
        {children}
      </AppShell>
    </>
  );
}

function DemoBanner() {
  return (
    <div
      role="status"
      className="border-b border-outline bg-champagne-100 px-4 py-2 text-center text-xs text-ink-soft"
    >
      Mode démo local : Supabase n&apos;est pas configuré, les données restent sur cet
      appareil et ne sont pas synchronisées.
    </div>
  );
}

function AccountBar({ session }: { session: ActiveSession }) {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  async function signOut() {
    setLeaving(true);
    const supabase = getSupabaseBrowserClient();
    // scope local : fonctionne aussi hors ligne (efface la session de l'appareil).
    await supabase?.auth.signOut({ scope: "local" });
    clearLastIdentity();
    clearActiveSession();
    router.replace("/connexion");
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-end gap-3 px-4 text-xs text-ink-soft">
      {session.mode === "OFFLINE" ? (
        <Badge tone="warning">Hors ligne — reconnexion requise pour synchroniser</Badge>
      ) : null}
      <span className="min-w-0 truncate">{session.email ?? "Compte connecté"}</span>
      <Button variant="ghost" size="sm" onClick={signOut} loading={leaving}>
        <LogOut className="size-4" aria-hidden="true" />
        Déconnexion
      </Button>
    </div>
  );
}
