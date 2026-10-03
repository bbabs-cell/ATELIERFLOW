"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import {
  Building2,
  CalendarDays,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Shirt,
  Users,
  UsersRound,
} from "lucide-react";
import { AppShell, Badge, StateView, type NavItem } from "@/ui";
import { Brand } from "./Brand";
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
import { useSyncRunner } from "@/features/sync/useSyncRunner";
import { SyncStatusChip } from "@/features/sync/SyncStatusChip";
import { PlanBanner } from "@/features/subscriptions/PlanBanner";
import { usePlatformAdmin } from "@/features/platform/usePlatformAdmin";

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
/** Visible seulement pour l'administration de la plateforme (SAAS_ADMIN). */
const PLATFORM_NAV: Omit<NavItem, "active"> = { label: "Plateforme", href: "/plateforme", icon: Building2 };
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

  // Lien d'invitation : accessible connecté ou non, sans atelier, et jamais
  // détourné vers /bienvenue (l'invité rejoint un atelier existant).
  const isInvitation = pathname.startsWith("/invitation/");
  const isPublic = isInvitation || PUBLIC_PATHS.includes(pathname);
  const target =
    state.status === "anonymous" && !isPublic
      ? "/connexion"
      : state.status === "needs-workspace" && pathname !== "/bienvenue" && !isInvitation
        ? "/bienvenue"
        : state.status === "ready" && state.session.mode !== "DEMO" && ENTRY_PATHS.includes(pathname)
          ? HOME_PATH
          : null;

  useEffect(() => {
    if (target) router.replace(target);
  }, [router, target]);

  // Envoi de la file de synchronisation (session Supabase valide uniquement :
  // hors ligne, le jeton n'est pas vérifiable ; en démo, pas de serveur).
  useSyncRunner(
    state.status === "ready" && state.session.mode === "SUPABASE"
      ? `${state.session.tenantId}:${state.session.profileId}`
      : null,
  );
  const platformAdmin = usePlatformAdmin(state.status === "ready" && state.session.mode === "SUPABASE");

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
  const navItems: NavItem[] = (platformAdmin ? [...NAV, PLATFORM_NAV] : NAV).map((item) => ({
    ...item,
    active: pathname === item.href || pathname.startsWith(`${item.href}/`),
  }));
  return (
    <>
      {state.session.mode === "DEMO" ? <DemoBanner /> : null}
      <AppShell
        brand={<Brand subtitle="Gestion d'atelier" />}
        navItems={navItems}
        footer={state.session.mode === "DEMO" ? null : <AccountCard session={state.session} />}
      >
        {state.session.mode === "SUPABASE" ? <PlanBanner /> : null}
        {state.session.mode === "OFFLINE" ? (
          <div className="mx-auto flex max-w-5xl justify-end px-4 pt-4">
            <Badge tone="warning" dot>
              Hors ligne — reconnexion requise pour synchroniser
            </Badge>
          </div>
        ) : null}
        <div key={pathname} className="animate-fade-up">
          {children}
        </div>
      </AppShell>
    </>
  );
}

function DemoBanner() {
  return (
    <div
      role="status"
      className="relative z-40 overflow-hidden bg-sunset-gradient px-4 py-2 text-center text-xs font-semibold text-chocolat-950 animate-gradient"
    >
      Mode démo local : Supabase n&apos;est pas configuré, les données restent sur cet
      appareil et ne sont pas synchronisées.
    </div>
  );
}

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Propriétaire",
  MANAGER: "Gérant",
  EMPLOYEE: "Employé",
  APPRENTICE: "Apprenti",
};

function initials(email: string | null): string {
  const local = (email ?? "?").split("@")[0] ?? "?";
  const parts = local.split(/[._-]+/).filter(Boolean);
  const letters = parts.length >= 2 ? parts[0][0] + parts[1][0] : local.slice(0, 2);
  return letters.toUpperCase();
}

function AccountCard({ session }: { session: ActiveSession }) {
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
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur animate-fade-up max-lg:border-outline max-lg:bg-surface-2">
      <span className="relative grid size-11 shrink-0 place-items-center rounded-full bg-ocean-gradient font-display text-sm font-bold text-white shadow-soft">
        {initials(session.email)}
        <span className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full border-2 border-chocolat-900 bg-menthe-500 animate-pulse-ring max-lg:border-surface" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold max-lg:text-ink">{session.email ?? "Compte connecté"}</span>
        <span className="block font-mono text-[10px] uppercase tracking-[0.16em] text-champagne-300 max-lg:text-flamme-600">
          {ROLE_LABELS[session.role ?? ""] ?? "Membre"}
        </span>
        {session.mode === "SUPABASE" ? <SyncStatusChip className="mt-1.5" /> : null}
      </span>
      <button
        type="button"
        onClick={signOut}
        disabled={leaving}
        aria-label="Déconnexion"
        title="Déconnexion"
        className="grid size-10 shrink-0 place-items-center rounded-full bg-white/10 text-ivoire-50 transition-all duration-300 hover:rotate-12 hover:bg-flamme-500 disabled:opacity-50 max-lg:bg-flamme-50 max-lg:text-flamme-600 max-lg:hover:text-white"
      >
        <LogOut className={leaving ? "size-4 animate-spin" : "size-4"} aria-hidden="true" />
      </button>
    </div>
  );
}
