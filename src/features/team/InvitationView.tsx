"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { Sparkles } from "lucide-react";
import { Badge, Button, Card, Field, Input, StateView } from "@/ui";
import { authErrorMessage, MIN_PASSWORD_LENGTH, validateCredentials } from "@/domain/auth/errors";
import { resolveIdentity } from "@/domain/auth/claims";
import { teamErrorMessage, type PublicInvitation } from "@/domain/team/invitations";
import { getSupabaseBrowserClient } from "@/infrastructure/supabase/browserClient";
import { getSupabaseBrowserEnv } from "@/infrastructure/supabase/env";
import { createTeamRemote } from "@/infrastructure/team/teamRemote";
import { AuthLayout } from "@/features/auth/AuthLayout";
import { ROLE_META } from "./constants";

const CLOSED_STATES: Record<string, { title: string; description: string }> = {
  NOT_FOUND: { title: "Invitation introuvable", description: "Ce lien n'est pas valide. Vérifiez qu'il est complet, ou demandez une nouvelle invitation." },
  ACCEPTED: { title: "Invitation déjà utilisée", description: "Ce lien a déjà servi. Connectez-vous pour accéder à l'atelier." },
  REVOKED: { title: "Invitation annulée", description: "L'atelier a annulé cette invitation. Demandez-en une nouvelle si besoin." },
  EXPIRED: { title: "Invitation expirée", description: "Ce lien n'est plus valable (7 jours). Demandez une nouvelle invitation à l'atelier." },
};

/** Page publique /invitation/<jeton> : rejoindre un atelier existant. */
export function InvitationView({ token }: { token: string }) {
  const router = useRouter();
  const { provisioned } = getSupabaseBrowserEnv();
  const [invitation, setInvitation] = useState<PublicInvitation | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) return;
    void client.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = client.auth.onAuthStateChange((_e, s) => setSession(s));
    void createTeamRemote(client)
      .getInvitation(token)
      .then(setInvitation)
      .catch((caught: unknown) => setLoadError(teamErrorMessage(caught instanceof Error ? caught : null)));
    return () => data.subscription.unsubscribe();
  }, [token]);

  const accept = useCallback(async () => {
    const client = getSupabaseBrowserClient();
    if (!client) return;
    setBusy(true);
    setError(null);
    try {
      await createTeamRemote(client).acceptInvitation(token);
      const { data } = await client.auth.refreshSession();
      if (data.session && resolveIdentity(data.session.access_token).kind === "READY") {
        router.replace("/dashboard");
      } else {
        setError("Vous avez rejoint l'atelier. Déconnectez-vous puis reconnectez-vous pour y accéder.");
      }
    } catch (caught) {
      setError(teamErrorMessage(caught instanceof Error ? caught : null));
    } finally {
      setBusy(false);
    }
  }, [router, token]);

  async function authenticate(event: FormEvent) {
    event.preventDefault();
    const client = getSupabaseBrowserClient();
    if (!client || !invitation?.email) return;
    setError(null);
    setNotice(null);
    const invalid = validateCredentials(invitation.email, password);
    if (invalid) {
      setError(invalid);
      return;
    }
    if (mode === "signup" && fullName.trim() === "") {
      setError("Indiquez votre nom.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signin") {
        const { data, error: signInError } = await client.auth.signInWithPassword({ email: invitation.email, password });
        if (signInError || !data.session) {
          setError(authErrorMessage(signInError));
          return;
        }
        setSession(data.session);
        await accept();
        return;
      }
      const { data, error: signUpError } = await client.auth.signUp({
        email: invitation.email,
        password,
        options: { data: { full_name: fullName.trim() }, emailRedirectTo: window.location.href },
      });
      if (signUpError) {
        setError(authErrorMessage(signUpError));
        return;
      }
      if (!data.session) {
        setNotice(`Compte créé. Ouvrez le lien de confirmation envoyé à ${invitation.email} : vous reviendrez ici pour rejoindre l'atelier.`);
        return;
      }
      setSession(data.session);
      await accept();
    } catch (caught) {
      setError(authErrorMessage(caught instanceof Error ? { message: caught.message } : null));
    } finally {
      setBusy(false);
    }
  }

  async function switchAccount() {
    await getSupabaseBrowserClient()?.auth.signOut({ scope: "local" });
    setSession(null);
    setMode("signin");
  }

  if (!provisioned) {
    return (
      <AuthLayout>
        <StateView variant="offline" title="Invitations indisponibles" description="Supabase n'est pas configuré sur ce déploiement." />
      </AuthLayout>
    );
  }
  if (loadError) {
    return (
      <AuthLayout>
        <StateView variant="error" title="Impossible d'ouvrir l'invitation" description={loadError} />
      </AuthLayout>
    );
  }
  if (invitation === null) {
    return (
      <AuthLayout>
        <StateView variant="loading" title="Ouverture de l'invitation…" />
      </AuthLayout>
    );
  }
  if (invitation.status !== "PENDING") {
    const closed = CLOSED_STATES[invitation.status];
    return (
      <AuthLayout>
        <StateView
          variant="empty"
          title={closed.title}
          description={closed.description}
          action={<Button onClick={() => router.replace("/connexion")}>Aller à la connexion</Button>}
        />
      </AuthLayout>
    );
  }

  const role = invitation.role ? ROLE_META[invitation.role] : null;
  const sessionEmail = session?.user.email?.toLowerCase() ?? null;
  const emailMatches = sessionEmail !== null && sessionEmail === invitation.email;

  return (
    <AuthLayout>
      <Card interactive={false} className="shadow-modal">
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-flamme-600 animate-fade-up">
          <Sparkles className="size-4 animate-float" aria-hidden="true" />
          Invitation
        </div>
        <h1 className="mt-2 font-display text-3xl font-extrabold leading-tight text-ink animate-fade-up">
          Rejoignez <span className="text-gradient">{invitation.tenantName ?? "l'atelier"}</span>
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          {invitation.invitedBy ? `${invitation.invitedBy} vous invite` : "Vous êtes invité(e)"} à travailler dans
          l&apos;atelier
          {role ? (
            <>
              {" "}comme <Badge tone={role.tone}>{role.label}</Badge>
            </>
          ) : null}
          .
        </p>
        <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-sm">
          Adresse invitée : <strong className="text-ink">{invitation.email}</strong>
        </p>

        {error ? (
          <p role="alert" className="mt-4 rounded-lg border-2 border-wax-300 bg-wax-50 px-3 py-2 text-sm font-semibold text-wax-600 animate-wiggle">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p role="status" className="mt-4 rounded-lg border-2 border-menthe-300 bg-menthe-50 px-3 py-2 text-sm font-semibold text-menthe-600 animate-pop">
            {notice}
          </p>
        ) : null}

        {session ? (
          emailMatches ? (
            <Button size="lg" className="mt-6 w-full" loading={busy} onClick={() => void accept()}>
              Rejoindre l&apos;atelier
            </Button>
          ) : (
            <div className="mt-6 flex flex-col gap-3">
              <p className="text-sm text-ink-soft">
                Vous êtes connecté(e) avec <strong className="text-ink">{session.user.email}</strong>. Cette invitation est
                destinée à <strong className="text-ink">{invitation.email}</strong>.
              </p>
              <Button variant="outline" onClick={() => void switchAccount()}>
                Changer de compte
              </Button>
            </div>
          )
        ) : (
          <form key={mode} className="stagger mt-6 flex flex-col gap-4" onSubmit={authenticate} noValidate>
            <div role="tablist" aria-label="Accès" className="grid grid-cols-2 rounded-full bg-chocolat-900 p-1.5">
              {(["signup", "signin"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => {
                    setMode(m);
                    setError(null);
                  }}
                  className={
                    "h-10 rounded-full text-sm font-bold transition-all duration-300 " +
                    (mode === m ? "bg-sunset-gradient text-chocolat-950 shadow-glow" : "text-chocolat-200 hover:text-white")
                  }
                >
                  {m === "signup" ? "Créer mon accès" : "J'ai déjà un compte"}
                </button>
              ))}
            </div>
            {mode === "signup" ? (
              <Field label="Votre nom" htmlFor="inv-name" required>
                <Input id="inv-name" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </Field>
            ) : null}
            <Field label="E-mail" htmlFor="inv-email">
              <Input id="inv-email" type="email" value={invitation.email ?? ""} readOnly className="bg-surface-2" />
            </Field>
            <Field
              label="Mot de passe"
              htmlFor="inv-password"
              required
              hint={mode === "signup" ? `${MIN_PASSWORD_LENGTH} caractères minimum.` : undefined}
            >
              <Input
                id="inv-password"
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Button type="submit" size="lg" className="mt-2 w-full" loading={busy}>
              {mode === "signup" ? "Créer mon accès et rejoindre" : "Se connecter et rejoindre"}
            </Button>
          </form>
        )}
      </Card>
    </AuthLayout>
  );
}
