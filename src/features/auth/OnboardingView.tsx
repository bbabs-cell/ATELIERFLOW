"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Field, Input, StateView } from "@/ui";
import { resolveIdentity } from "@/domain/auth/claims";
import { authErrorMessage } from "@/domain/auth/errors";
import { getSupabaseBrowserClient } from "@/infrastructure/supabase/browserClient";
import { getSupabaseBrowserEnv } from "@/infrastructure/supabase/env";
import { AuthLayout } from "./LoginView";

/**
 * Création du premier atelier (tenant) après inscription.
 * Le RPC `create_owner_tenant` (0011/0015) crée l'atelier et la membership
 * OWNER ACTIVE ; le rafraîchissement de session fait alors poser le claim
 * `tenant_id` par le hook GoTrue.
 */
export function OnboardingView() {
  const router = useRouter();
  // Même valeur côté serveur et navigateur : pas d'écart d'hydratation.
  const { provisioned } = getSupabaseBrowserEnv();
  const [checking, setChecking] = useState(provisioned);
  const [hasSession, setHasSession] = useState(false);
  const [defaultName, setDefaultName] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (supabase === null) return;
    void supabase.auth.getSession().then(({ data }) => {
      setHasSession(data.session !== null);
      const fullName = data.session?.user.user_metadata?.full_name;
      setDefaultName(typeof fullName === "string" && fullName.trim() !== "" ? fullName.trim() : null);
      setChecking(false);
    });
  }, []);

  if (checking) {
    return (
      <AuthLayout>
        <StateView variant="loading" />
      </AuthLayout>
    );
  }
  if (!provisioned || !hasSession) {
    return (
      <AuthLayout>
        <StateView
          variant="empty"
          title="Connectez-vous d'abord"
          description="La création d'un atelier nécessite un compte connecté."
          action={<Button onClick={() => router.replace("/connexion")}>Se connecter</Button>}
        />
      </AuthLayout>
    );
  }
  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const client = getSupabaseBrowserClient();
    if (client === null) return;
    const workshop = name.trim();
    if (workshop.length < 2) {
      setError("Donnez un nom à votre atelier (2 caractères minimum).");
      return;
    }
    setBusy(true);
    try {
      const { error: rpcError } = await client.rpc("create_owner_tenant", {
        p_name: workshop,
        p_display_name: defaultName,
      });
      if (rpcError) {
        setError(authErrorMessage(rpcError));
        return;
      }
      const { data, error: refreshError } = await client.auth.refreshSession();
      if (refreshError || !data.session) {
        setError(authErrorMessage(refreshError));
        return;
      }
      if (resolveIdentity(data.session.access_token).kind !== "READY") {
        setError(
          "Votre atelier est créé, mais la session ne le contient pas encore. " +
            "Le hook d'authentification Supabase (Auth → Hooks → Customize Access Token) " +
            "doit être activé par l'administrateur.",
        );
        return;
      }
      router.replace("/dashboard");
    } catch (caught) {
      setError(authErrorMessage(caught instanceof Error ? { message: caught.message } : null));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <Card>
        <h1 className="font-display text-3xl text-ink">Votre atelier</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Dernière étape : nommez votre atelier. Vous en serez le propriétaire et pourrez
          inviter votre équipe ensuite.
        </p>
        <form className="mt-6 flex flex-col gap-4" onSubmit={onSubmit} noValidate>
          <Field label="Nom de l'atelier" htmlFor="workshop-name" required>
            <Input
              id="workshop-name"
              autoComplete="organization"
              placeholder="Ex. Atelier Awa Couture"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <Button type="submit" size="lg" loading={busy}>
            Créer mon atelier
          </Button>
        </form>
      </Card>
    </AuthLayout>
  );
}
