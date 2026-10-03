"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Field, Input, Select, StateView } from "@/ui";
import { COUNTRY_OPTIONS, guessCountry } from "@/domain/geo/countries";
import { authErrorMessage, MIN_PASSWORD_LENGTH, validateCredentials } from "@/domain/auth/errors";
import { resolveIdentity } from "@/domain/auth/claims";
import { AuthLayout } from "./AuthLayout";
import { getSupabaseBrowserClient } from "@/infrastructure/supabase/browserClient";
import { getSupabaseBrowserEnv } from "@/infrastructure/supabase/env";

type Mode = "signin" | "signup";

export function LoginView() {
  const router = useRouter();
  // Même valeur côté serveur et navigateur (variables inlinées) : pas d'écart d'hydratation.
  const { provisioned } = getSupabaseBrowserEnv();
  const [mode, setMode] = useState<Mode>("signin");
  const [fullName, setFullName] = useState("");
  const [country, setCountry] = useState("SN");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Pays proposé d'après la langue du navigateur (« fr-CI » → Côte d'Ivoire).
  useEffect(() => {
    void Promise.resolve().then(() => setCountry(guessCountry(navigator.language)));
  }, []);

  // Arrivée depuis la vitrine (« Commencer gratuitement ») : création de compte.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("inscription")) {
      void Promise.resolve().then(() => setMode("signup"));
    }
  }, []);

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
          data: { full_name: fullName.trim(), country },
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

  /** Envoie le lien de réinitialisation à l'adresse saisie (réponse identique que le compte existe ou non). */
  async function forgotPassword() {
    setError(null);
    setNotice(null);
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Saisissez d'abord votre adresse e-mail, puis touchez « Mot de passe oublié ? ».");
      return;
    }
    const client = getSupabaseBrowserClient();
    if (!client) return;
    setBusy(true);
    try {
      const { error: resetError } = await client.auth.resetPasswordForEmail(trimmed, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (resetError && resetError.status === 429) {
        setError(authErrorMessage(resetError));
      } else {
        setNotice(`Si un compte existe pour ${trimmed}, un e-mail vient d'être envoyé avec un lien pour choisir un nouveau mot de passe. Pensez à regarder les courriers indésirables.`);
      }
    } catch (e) {
      setError(authErrorMessage(e instanceof Error ? e : null));
    } finally {
      setBusy(false);
    }
  }

  const signup = mode === "signup";

  return (
    <AuthLayout>
      <Card interactive={false} className="shadow-modal">
        <div role="tablist" aria-label="Accès" className="relative mb-6 grid grid-cols-2 rounded-full bg-chocolat-900 p-1.5">
          <span
            aria-hidden="true"
            className={
              "absolute inset-y-1.5 left-1.5 w-[calc(50%-0.375rem)] rounded-full bg-sunset-gradient shadow-glow transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] " +
              (signup ? "translate-x-full" : "translate-x-0")
            }
          />
          {(["signin", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => {
                setMode(m);
                setError(null);
                setNotice(null);
              }}
              className={
                "relative z-10 h-11 rounded-full text-sm font-bold transition-colors duration-300 " +
                (mode === m ? "text-white" : "text-chocolat-200 hover:text-white")
              }
            >
              {m === "signin" ? "Connexion" : "Créer un compte"}
            </button>
          ))}
        </div>
        <h1 key={mode} className="font-display text-3xl text-ink animate-fade-up">
          {signup ? "Créer votre compte" : "Connexion"}
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          {signup
            ? "Vous créerez ensuite votre atelier."
            : "Accédez à votre atelier : clients, commandes, paiements."}
        </p>

        <form key={`form-${mode}`} className="stagger mt-6 flex flex-col gap-4" onSubmit={onSubmit} noValidate>
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
          {signup ? (
            <Field label="Pays" htmlFor="auth-country" required hint="La monnaie de votre atelier en dépend (modifiable ensuite).">
              <Select id="auth-country" value={country} onChange={(e) => setCountry(e.target.value)} autoComplete="country">
                {COUNTRY_OPTIONS.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </Select>
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

          {!signup ? (
            <button
              type="button"
              onClick={() => void forgotPassword()}
              disabled={busy}
              className="-mt-2 min-h-11 self-end text-sm font-semibold text-flamme-600 underline-offset-4 hover:underline disabled:opacity-50"
            >
              Mot de passe oublié ?
            </button>
          ) : null}

          {error ? (
            <p role="alert" className="rounded-lg border-2 border-wax-300 bg-wax-50 px-3 py-2 text-sm font-semibold text-wax-600 animate-wiggle">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p role="status" className="rounded-lg border-2 border-menthe-300 bg-menthe-50 px-3 py-2 text-sm font-semibold text-menthe-600 animate-pop">
              {notice}
            </p>
          ) : null}

          <Button type="submit" size="lg" loading={busy} className="mt-2 w-full">
            {signup ? "Créer mon compte" : "Se connecter"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-soft">
          {signup ? "Déjà un compte ?" : "Pas encore de compte ?"}{" "}
          <button
            type="button"
            className="min-h-11 font-bold text-flamme-600 underline-offset-4 transition-colors hover:text-wax-500 hover:underline"
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
