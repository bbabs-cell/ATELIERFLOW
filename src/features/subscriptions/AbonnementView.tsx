"use client";

import { useState } from "react";
import { Check, CreditCard, Hourglass, X } from "lucide-react";
import { Badge, Button, Dialog, StateView, type BadgeTone } from "@/ui";
import { cx } from "@/lib/cx";
import { peekActiveSession } from "@/application/auth/session";
import { can, type TenantRoleCode } from "@/domain/team/roles";
import {
  daysLeft,
  FEATURE_LABELS,
  formatLimit,
  formatPrice,
  METER_LABELS,
  meters,
  planAction,
  planErrorMessage,
  STATUS_LABELS,
  type EntitlementStatus,
  type Entitlements,
  type FeatureFlag,
  type PlanInfo,
} from "@/domain/subscriptions/entitlements";
import { getSupabaseBrowserClient } from "@/infrastructure/supabase/browserClient";
import { createSubscriptionRemote } from "@/infrastructure/subscriptions/subscriptionRemote";
import { setEntitlements, useEntitlements } from "./useEntitlements";

const STATUS_TONES: Record<EntitlementStatus, BadgeTone> = {
  TRIAL: "info",
  ACTIVE: "success",
  GRACE: "warning",
  EXPIRED: "danger",
  NONE: "neutral",
};

const FEATURES: FeatureFlag[] = ["whatsapp", "stock", "audit"];

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "—";
}

function storageLabel(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb < 1 && bytes > 0 ? "< 1 Mo" : formatLimit(Math.ceil(mb), "Mo");
}

function statusLine(e: Entitlements): string {
  const defaultPlan = e.plans.find((p) => p.isDefault)?.name ?? "gratuit";
  switch (e.status) {
    case "TRIAL": {
      const days = daysLeft(e.trialEndsAt);
      return `Essai gratuit jusqu'au ${formatDate(e.trialEndsAt)}${days !== null ? ` (${days} jour${days > 1 ? "s" : ""} restant${days > 1 ? "s" : ""})` : ""}. Ensuite, l'atelier passe au plan ${defaultPlan} si aucun plan n'est activé.`;
    }
    case "ACTIVE":
      return e.periodEnd ? `Payé jusqu'au ${formatDate(e.periodEnd)}.` : "Sans échéance.";
    case "GRACE":
      return `Échéance dépassée : paiement attendu avant le ${formatDate(e.graceEndsAt)}.`;
    case "EXPIRED":
      return `Votre abonnement est arrivé à échéance : l'atelier fonctionne avec le plan ${e.planName}. Vos données sont conservées ; seules les nouvelles créations au-delà des limites sont bloquées.`;
    case "NONE":
      return `L'atelier utilise le plan ${e.planName}.`;
  }
}

function meterHint(level: "ok" | "near" | "full", kind: string, pending: number): string | null {
  if (level === "full") return "Limite atteinte.";
  if (kind === "users" && pending > 0) return `dont ${pending} invitation${pending > 1 ? "s" : ""} en attente`;
  return level === "near" ? "Bientôt atteinte." : null;
}

type Pending = { plan: PlanInfo; mode: "switch" | "request" } | { plan: null; mode: "cancel" };

export function AbonnementView(): React.ReactElement {
  const { entitlements, refresh } = useEntitlements();
  const session = peekActiveSession();
  const role = (session?.role ?? null) as TenantRoleCode | null;
  const canView = role !== null && can(role, "subscriptions.view");
  const canManage = role !== null && can(role, "tenant.settings") && session?.mode === "SUPABASE";
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (session?.mode === "DEMO") {
    return (
      <Page>
        <StateView
          variant="empty"
          title="Abonnement indisponible en mode démo"
          description="Le plan et ses limites sont gérés par le serveur : connectez l'application à Supabase pour les voir."
        />
      </Page>
    );
  }
  if (!canView) {
    return (
      <Page>
        <StateView
          variant="empty"
          title="Abonnement non accessible"
          description="Seuls le propriétaire et le gérant de l'atelier consultent l'abonnement."
        />
      </Page>
    );
  }
  if (!entitlements) {
    return (
      <Page>
        <StateView
          variant="loading"
          title="Chargement de l'abonnement…"
          description="Une connexion Internet est nécessaire la première fois."
          action={<Button variant="outline" size="sm" onClick={() => void refresh()}>Réessayer</Button>}
        />
      </Page>
    );
  }

  async function confirm() {
    if (!pending) return;
    const client = getSupabaseBrowserClient();
    if (!client) return;
    setBusy(true);
    setError(null);
    try {
      const next = await createSubscriptionRemote(client).requestPlanChange(pending.plan?.code ?? null);
      setEntitlements(next);
      setNotice(
        pending.mode === "switch"
          ? `L'atelier est passé au plan ${pending.plan?.name}.`
          : pending.mode === "request"
            ? `Demande envoyée : le plan ${pending.plan?.name} sera activé après paiement.`
            : "Demande annulée.",
      );
      setPending(null);
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      const planMessage = planErrorMessage(code);
      setError(
        planMessage && pending.mode === "switch"
          ? `Impossible de passer à ce plan : votre usage actuel dépasse ses limites. ${planMessage}`
          : planMessage ?? (navigator.onLine ? "L'opération a échoué. Réessayez." : "Connexion Internet requise."),
      );
    } finally {
      setBusy(false);
    }
  }

  const e = entitlements;
  const requested = e.requestedPlanCode ? e.plans.find((p) => p.code === e.requestedPlanCode) ?? null : null;

  return (
    <Page>
      {notice ? (
        <p role="status" className="mb-4 rounded-md bg-success-soft px-3 py-2 text-sm text-success animate-fade-up">
          {notice}
        </p>
      ) : null}

      <section className="rounded-xl border border-outline bg-surface/90 p-4 shadow-soft backdrop-blur animate-fade-up sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-sunset-gradient text-chocolat-950 shadow-soft">
              <CreditCard className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-2xl text-ink">Plan {e.planName}</h2>
                <Badge tone={STATUS_TONES[e.status]} dot>
                  {STATUS_LABELS[e.status]}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-ink-soft">{statusLine(e)}</p>
            </div>
          </div>
          <p className="font-display text-2xl text-ink">
            {formatPrice(e.status === "TRIAL" ? 0 : e.priceMonthly, e.currency)}
            {e.priceMonthly > 0 && e.status !== "TRIAL" ? <span className="text-sm font-normal text-ink-faint"> / mois</span> : null}
          </p>
        </div>

        {requested ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-outline bg-surface-2 px-3 py-2.5 text-sm">
            <span className="flex min-w-0 items-center gap-2 text-ink">
              <Hourglass className="size-4 shrink-0 text-flamme-600" aria-hidden="true" />
              <span className="min-w-0">
                Passage au plan <strong>{requested.name}</strong> demandé le {formatDate(e.requestedAt)} :
                activé dès réception du paiement.
              </span>
            </span>
            {canManage ? (
              <Button variant="ghost" size="sm" onClick={() => { setError(null); setPending({ plan: null, mode: "cancel" }); }}>
                Annuler la demande
              </Button>
            ) : null}
          </div>
        ) : null}

        <div className="mt-6 grid grid-cols-1 gap-3 @lg:grid-cols-2 @4xl:grid-cols-4">
          {meters(e).map((m) => (
            <div
              key={m.kind}
              className={cx(
                "rounded-md border p-3",
                m.level === "full" ? "border-danger bg-danger-soft" : "border-outline bg-surface-2",
              )}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                <p className="text-xs tracking-wide text-ink-soft">{METER_LABELS[m.kind]}</p>
                <p className={cx("font-display text-lg", m.level === "full" ? "text-danger" : "text-ink")}>
                  {m.kind === "storage" ? storageLabel(e.usage.storageBytes) : m.used}
                  <span className="text-sm text-ink-faint"> / {formatLimit(m.limit, m.kind === "storage" ? "Mo" : "")}</span>
                </p>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-beige-100">
                <div
                  className={cx(
                    "h-full rounded-full transition-[width] duration-700",
                    m.level === "full" ? "bg-danger" : m.level === "near" ? "bg-warning" : "bg-flamme-gradient",
                  )}
                  style={{ width: `${m.percent}%` }}
                />
              </div>
              {meterHint(m.level, m.kind, e.usage.pendingInvitations) ? (
                <p className={cx("mt-1.5 text-xs", m.level === "full" ? "text-danger" : "text-ink-faint")}>
                  {meterHint(m.level, m.kind, e.usage.pendingInvitations)}
                </p>
              ) : null}
            </div>
          ))}
        </div>

        <ul className="mt-4 flex flex-wrap gap-2">
          {FEATURES.map((f) => (
            <li
              key={f}
              className={cx(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm",
                e.limits[f] ? "bg-success-soft text-success" : "bg-surface-2 text-ink-faint line-through",
              )}
            >
              {e.limits[f] ? <Check className="size-3.5" aria-hidden="true" /> : <X className="size-3.5" aria-hidden="true" />}
              {FEATURE_LABELS[f]}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="font-display text-xl text-ink">Plans</h2>
        <p className="mt-1 text-sm text-ink-soft">
          {canManage
            ? "Un plan gratuit s'applique tout de suite. Un plan payant est d'abord demandé : il est activé après paiement (Wave, Orange Money ou espèces), sans perte de données."
            : "Seul le propriétaire de l'atelier peut changer de plan."}
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 @2xl:grid-cols-3">
          {e.plans.map((plan) => {
            const action = planAction(e, plan);
            return (
              <article
                key={plan.code}
                className={cx(
                  "flex flex-col rounded-lg border bg-surface p-4 transition-shadow duration-300 hover:shadow-lift",
                  action === "current" ? "border-flamme-500 ring-1 ring-flamme-500" : "border-outline",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display text-xl text-ink">{plan.name}</h3>
                  {action === "current" ? <Badge tone="primary">Actuel</Badge> : null}
                  {action === "requested" ? <Badge tone="warning">Demandé</Badge> : null}
                </div>
                {plan.description ? <p className="mt-1 text-sm text-ink-faint">{plan.description}</p> : null}
                <p className="mt-3 font-display text-2xl text-ink">
                  {formatPrice(plan.priceMonthly, plan.currency)}
                  {plan.priceMonthly > 0 ? <span className="text-sm font-normal text-ink-faint"> / mois</span> : null}
                </p>
                {plan.trialDays > 0 ? (
                  <p className="mt-0.5 text-xs text-flamme-700">Essai gratuit de {plan.trialDays} jours à la création de l&apos;atelier</p>
                ) : null}
                <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
                  <dt className="text-ink-soft">Clients</dt>
                  <dd className="text-right font-medium text-ink">{formatLimit(plan.limits.customers_max)}</dd>
                  <dt className="text-ink-soft">Commandes en cours</dt>
                  <dd className="text-right font-medium text-ink">{formatLimit(plan.limits.orders_max)}</dd>
                  <dt className="text-ink-soft">Utilisateurs</dt>
                  <dd className="text-right font-medium text-ink">{formatLimit(plan.limits.users_max)}</dd>
                  <dt className="text-ink-soft">Stockage</dt>
                  <dd className="text-right font-medium text-ink">{formatLimit(plan.limits.storage_mb, "Mo")}</dd>
                </dl>
                <ul className="mt-3 flex flex-col gap-1.5 text-sm">
                  {FEATURES.map((f) => (
                    <li key={f} className={cx("flex items-center gap-2", plan.limits[f] ? "text-ink" : "text-ink-faint")}>
                      {plan.limits[f] ? (
                        <Check className="size-4 shrink-0 text-success" aria-hidden="true" />
                      ) : (
                        <X className="size-4 shrink-0" aria-hidden="true" />
                      )}
                      {FEATURE_LABELS[f]}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-4">
                  {canManage && action === "switch" ? (
                    <Button variant="outline" size="sm" className="w-full" onClick={() => { setError(null); setPending({ plan, mode: "switch" }); }}>
                      Passer à ce plan
                    </Button>
                  ) : canManage && action === "request" ? (
                    <Button size="sm" className="w-full" onClick={() => { setError(null); setPending({ plan, mode: "request" }); }}>
                      Demander ce plan
                    </Button>
                  ) : action === "requested" ? (
                    <p className="rounded-md bg-warning-soft px-2 py-1.5 text-center text-sm text-warning">En attente de paiement</p>
                  ) : action === "current" ? (
                    <p className="rounded-md bg-flamme-50 px-2 py-1.5 text-center text-sm font-medium text-flamme-700">Plan actuel</p>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <Dialog
        open={pending !== null}
        onClose={() => (busy ? undefined : setPending(null))}
        title={
          pending?.mode === "switch"
            ? `Passer au plan ${pending.plan?.name}`
            : pending?.mode === "request"
              ? `Demander le plan ${pending.plan?.name}`
              : "Annuler la demande"
        }
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)} disabled={busy}>
              Retour
            </Button>
            <Button onClick={() => void confirm()} loading={busy}>
              {pending?.mode === "switch" ? "Changer de plan" : pending?.mode === "request" ? "Envoyer la demande" : "Annuler la demande"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 text-sm text-ink-soft">
          {pending?.mode === "switch" ? (
            <p>
              Le changement est immédiat. Les limites du plan {pending.plan?.name} s&apos;appliquent dès maintenant
              aux nouvelles créations ; vos données restent intactes.
            </p>
          ) : pending?.mode === "request" && pending.plan ? (
            <>
              <p>
                Le plan {pending.plan.name} coûte {formatPrice(pending.plan.priceMonthly, pending.plan.currency)} par mois.
                Vous gardez votre plan actuel jusqu&apos;à réception du paiement ; le nouveau plan est alors activé.
              </p>
              <p>Vous pouvez annuler la demande à tout moment.</p>
            </>
          ) : (
            <p>La demande de changement de plan sera retirée.</p>
          )}
          {error ? (
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-danger">
              {error}
            </p>
          ) : null}
        </div>
      </Dialog>
    </Page>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div className="@container mx-auto w-full max-w-5xl px-4 py-6 sm:py-10">
      <header className="mb-8">
        <h1 className="page-title text-4xl text-ink sm:text-5xl">Abonnement</h1>
        <p className="mt-1 text-sm text-ink-soft">Votre plan, son usage et ses limites.</p>
      </header>
      {children}
    </div>
  );
}
