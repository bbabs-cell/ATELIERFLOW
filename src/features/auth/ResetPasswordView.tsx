"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card, Field, Input, StateView } from "@/ui";
import { authErrorMessage, MIN_PASSWORD_LENGTH } from "@/domain/auth/errors";
import { getSupabaseBrowserClient } from "@/infrastructure/supabase/browserClient";
import { AuthLayout } from "./AuthLayout";

type Phase = "checking" | "ready" | "invalid" | "done";

/**
 * Arrivée depuis le lien « mot de passe oublié » reçu par e-mail : Supabase
 * ouvre une session de récupération à partir du lien, l'utilisateur choisit
 * alors son nouveau mot de passe.
 */
export function ResetPasswordView(): React.ReactElement {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) {
      void Promise.resolve().then(() => setPhase("invalid"));
      return;
    }
    let settled = false;
    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (session && event === "SIGNED_IN")) {
        settled = true;
        setPhase("ready");
      }
    });
    // Le lien a peut-être déjà été traité au chargement du client.
    void client.auth.getSession().then(({ data: current }) => {
      if (current.session) {
        settled = true;
        setPhase("ready");
      }
    });
    const timer = window.setTimeout(() => {
      if (!settled) setPhase("invalid");
    }, 4000);
    return () => {
      data.subscription.unsubscribe();
      window.clearTimeout(timer);
    };
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) return setError(`Mot de passe : ${MIN_PASSWORD_LENGTH} caractères minimum.`);
    if (password !== confirm) return setError("Les deux mots de passe ne sont pas identiques.");
    const client = getSupabaseBrowserClient();
    if (!client) return;
    setBusy(true);
    const { error: updateError } = await client.auth.updateUser({ password });
    setBusy(false);
    if (updateError) return setError(authErrorMessage(updateError));
    setPhase("done");
    window.setTimeout(() => router.replace("/dashboard"), 1500);
  }

  return (
    <AuthLayout>
      <Card interactive={false} className="shadow-modal">
        {phase === "checking" ? (
          <StateView variant="loading" title="Vérification du lien…" />
        ) : phase === "invalid" ? (
          <StateView
            variant="error"
            title="Lien expiré ou déjà utilisé"
            description="Demandez un nouveau lien depuis la page de connexion (« Mot de passe oublié ? »)."
            action={
              <Link href="/connexion" className="font-semibold text-flamme-600 underline-offset-4 hover:underline">
                Retour à la connexion
              </Link>
            }
          />
        ) : phase === "done" ? (
          <StateView variant="success" title="Mot de passe changé" description="Ouverture de votre atelier…" />
        ) : (
          <>
            <h1 className="font-display text-3xl text-ink">Nouveau mot de passe</h1>
            <p className="mt-1 text-sm text-ink-soft">Choisissez le mot de passe que vous utiliserez désormais.</p>
            <form className="mt-6 flex flex-col gap-4" onSubmit={(e) => void onSubmit(e)} noValidate>
              <Field label="Nouveau mot de passe" htmlFor="reset-password" required hint={`${MIN_PASSWORD_LENGTH} caractères minimum.`}>
                <Input id="reset-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
              <Field label="Confirmer" htmlFor="reset-confirm" required>
                <Input id="reset-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </Field>
              {error ? (
                <p role="alert" className="rounded-lg border-2 border-wax-300 bg-wax-50 px-3 py-2 text-sm font-semibold text-wax-600">
                  {error}
                </p>
              ) : null}
              <Button type="submit" size="lg" loading={busy} className="mt-2 w-full">
                Enregistrer le mot de passe
              </Button>
            </form>
          </>
        )}
      </Card>
    </AuthLayout>
  );
}
