"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Field, Input, StateView } from "@/ui";
import { authErrorMessage, MIN_PASSWORD_LENGTH, validateCredentials } from "@/domain/auth/errors";
import { resolveIdentity } from "@/domain/auth/claims";
import { getSupabaseBrowserClient } from "@/infrastructure/supabase/browserClient";
import { getSupabaseBrowserEnv } from "@/infrastructure/supabase/env";

type Mode = "signin" | "signup";

export function LoginView() {
  const router = useRouter();
  // Même valeur côté serveur et navigateur (variables inlinées) : pas d'écart d'hydratation.
  const { provisioned } = getSupabaseBrowserEnv();
  const [mode, setMode] = useState<Mode>("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!provisioned) {
    return (
      <AuthLayout>
        <StateView
          variant="offline"
          title="Connexion indisponible"
          description="Supabase n'est pas configuré sur ce déploiement : l'application fonctionne en mode démo local."
          action={<Button onClick={() => router.replace("/dashboard")}>Ouvrir le mode démo</Button>}
        />
      </AuthLayout>
    );
  }
  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    const client = getSupabaseBrowserClient();
    if (client === null) return;
    const invalid = validateCredentials(email, password);
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
        const { data, error: signInError } = await client.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError || !data.session) {
          setError(authErrorMessage(signInError));
          return;
        }
        const identity = resolveIdentity(data.session.access_token);
        router.replace(identity.kind === "READY" ? "/dashboard" : "/bienvenue");
        return;
      }
      const { data, error: signUpError } = await client.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { full_name: fullName.trim() },
          emailRedirectTo: `${window.location.origin}/bienvenue`,
        },
      });
      if (signUpError) {
        setError(authErrorMessage(signUpError));
        return;
      }
      if (!data.session) {
        setNotice(
          "Compte créé. Ouvrez le lien de confirmation envoyé à " +
            email.trim() +
            ", puis connectez-vous.",
        );
        setMode("signin");
        setPassword("");
        return;
      }
      router.replace("/bienvenue");
    } catch (caught) {
      setError(authErrorMessage(caught instanceof Error ? { message: caught.message } : null));
    } finally {
      setBusy(false);
    }
  }

  const signup = mode === "signup";

  return (
    <AuthLayout>
      <Card>
        <h1 className="font-display text-3xl text-ink">
          {signup ? "Créer votre compte" : "Connexion"}
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          {signup
            ? "Vous créerez ensuite votre atelier."
            : "Accédez à votre atelier : clients, commandes, paiements."}
        </p>

        <form className="mt-6 flex flex-col gap-4" onSubmit={onSubmit} noValidate>
          {signup ? (
            <Field label="Votre nom" htmlFor="auth-name" required>
              <Input
                id="auth-name"
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </Field>
          ) : null}
          <Field label="E-mail" htmlFor="auth-email" required>
            <Input
              id="auth-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field
            label="Mot de passe"
            htmlFor="auth-password"
            required
            hint={signup ? `${MIN_PASSWORD_LENGTH} caractères minimum.` : undefined}
          >
            <Input
              id="auth-password"
              type="password"
              autoComplete={signup ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>

          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p role="status" className="text-sm text-success">
              {notice}
            </p>
          ) : null}

          <Button type="submit" size="lg" loading={busy}>
            {signup ? "Créer mon compte" : "Se connecter"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-soft">
          {signup ? "Déjà un compte ?" : "Pas encore de compte ?"}{" "}
          <button
            type="button"
            className="min-h-11 font-medium text-chocolat-700 underline-offset-4 hover:underline"
            onClick={() => {
              setMode(signup ? "signin" : "signup");
              setError(null);
              setNotice(null);
            }}
          >
            {signup ? "Se connecter" : "Créer un compte"}
          </button>
        </p>
      </Card>
    </AuthLayout>
  );
}

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <p className="mb-6 text-center font-display text-2xl italic text-chocolat-800">Atelier</p>
      {children}
    </div>
  );
}
