"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, StateView } from "@/ui";
import { Check, CreditCard, X } from "lucide-react";
import type { SubscriptionOverview } from "@/application/subscriptions/subscriptionService";
import { getPlan, formatXof, RESOURCE_LABELS } from "@/domain/subscriptions/plans";
import type { ResourceKind } from "@/domain/subscriptions/plans";
import { getSubscriptionsFacade } from "./facade";
import {
  PLAN_META,
  PLAN_OPTIONS,
  SUBSCRIPTION_STATUS_META,
} from "./constants";

const RESOURCE_ORDER: ResourceKind[] = ["users", "customers", "orders", "storage"];

export function AbonnementView(): React.ReactElement {
  const [overview, setOverview] = useState<SubscriptionOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);
    try {
      const result = await getSubscriptionsFacade().subscriptions.getOverview();
      if (!result.ok) {
        setForbidden(true);
        setLoading(false);
        return;
      }
      setOverview(result.overview);
    } catch {
      setError("Impossible de charger l'abonnement.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await load();
      } catch {
        // load encode déjà l'erreur
      }
    })();
  }, [load]);

  if (forbidden) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:py-10">
        <StateView
          variant="empty"
          title="Abonnement non accessible"
          description="Votre rôle ne permet pas de consulter l'abonnement (subscriptions.view)."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:py-10">
      <header>
        <h1 className="font-display text-3xl text-ink sm:text-4xl">Abonnement · Plans</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Plan actuel du workspace, usages et limites. La facturation est
          gérée côté serveur (phase 04).
        </p>
      </header>

      <main className="mt-8">
        {error ? (
          <StateView
            variant="error"
            title="Impossible de charger l'abonnement"
            description={error}
            action={<Button onClick={() => load().catch(() => undefined)}>Réessayer</Button>}
          />
        ) : loading || overview === null ? (
          <StateView variant="loading" title="Chargement…" />
        ) : (
          <>
            <section className="rounded-lg border border-outline bg-surface p-4 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="flex size-11 items-center justify-center rounded-full bg-champagne-400 text-chocolat-950">
                    <CreditCard className="size-5" aria-hidden="true" />
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-display text-2xl text-ink">
                        Plan {overview.currentPlan.name}
                      </h2>
                      <Badge tone={PLAN_META[overview.currentPlan.code as keyof typeof PLAN_META].tone}>
                        {overview.currentPlan.code}
                      </Badge>
                      <Badge tone={SUBSCRIPTION_STATUS_META[overview.status as keyof typeof SUBSCRIPTION_STATUS_META].tone}>
                        {SUBSCRIPTION_STATUS_META[overview.status as keyof typeof SUBSCRIPTION_STATUS_META].label}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-ink-faint">
                      {formatXof(overview.currentPlan.priceMonthlyCents)}{" "}
                      / mois · {overview.currentPlan.description}
                    </p>
                  </div>
                </div>
                <div className="text-right text-sm text-ink-soft">
                  <p>
                    Prochaine échéance :{" "}
                    <span className="font-medium text-ink">
                      {overview.nextBillingLabel ?? "—"}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-ink-faint">
                    La gestion (changement de plan, facturation) est réservée
                    au service plateforme en ligne.
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {RESOURCE_ORDER.map((kind) => {
                  const resource = overview.resources.find((r) => r.kind === kind);
                  if (!resource) return null;
                  const label = RESOURCE_LABELS[kind];
                  return (
                    <div
                      key={kind}
                      className={`rounded-md border p-3 ${
                        resource.exceeded ? "border-danger bg-danger-soft" : "border-outline bg-surface-2"
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-xs tracking-wide text-ink-soft">{label.label}</p>
                        <p
                          className={`font-display text-lg ${
                            resource.exceeded ? "text-danger" : "text-ink"
                          }`}
                        >
                          {resource.used}
                          <span className="text-sm text-ink-faint"> / {resource.limit}</span>
                        </p>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-beige-100">
                        <div
                          className={`h-full rounded-full ${resource.exceeded ? "bg-danger" : "bg-champagne-400"}`}
                          style={{ width: `${resource.percent}%` }}
                        />
                      </div>
                      {resource.exceeded ? (
                        <p className="mt-1.5 text-xs text-danger">
                          Limite dépassée — passez au plan supérieur.
                        </p>
                      ) : (
                        <p className="mt-1.5 text-xs text-ink-faint">{label.hint}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="mt-6 rounded-lg border border-outline bg-surface p-4 sm:p-6">
              <h2 className="font-display text-xl text-ink">Fonctionnalités incluses</h2>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {overview.features.map((feature) => (
                  <li
                    key={feature.feature}
                    className="flex items-center gap-2 rounded-md bg-surface-2 px-3 py-2 text-sm"
                  >
                    {feature.enabled ? (
                      <Check className="size-4 shrink-0 text-success" aria-hidden="true" />
                    ) : (
                      <X className="size-4 shrink-0 text-ink-faint" aria-hidden="true" />
                    )}
                    <span
                      className={
                        feature.enabled ? "font-medium text-ink" : "text-ink-faint line-through"
                      }
                    >
                      {feature.label}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="mt-6">
              <h2 className="font-display text-xl text-ink">Comparer les plans</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {PLAN_OPTIONS.map((code) => {
                  const plan = getPlan(code);
                  const meta = PLAN_META[code];
                  const isCurrent = code === overview.currentPlan.code;
                  return (
                    <div
                      key={code}
                      className={`rounded-lg border bg-surface p-4 ${
                        isCurrent ? "border-chocolat-600 ring-1 ring-chocolat-600" : "border-outline"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <h3 className="font-display text-xl text-ink">{plan.name}</h3>
                        <Badge tone={meta.tone}>{code}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-ink-faint">{plan.description}</p>
                      <p className="mt-3 font-display text-2xl text-ink">
                        {formatXof(plan.price_monthly_cents)}
                        <span className="text-sm font-normal text-ink-faint"> / mois</span>
                      </p>
                      {isCurrent ? (
                        <p className="mt-3 rounded-md bg-champagne-100 px-2 py-1 text-center text-sm font-medium text-chocolat-800">
                          Plan actuel
                        </p>
                      ) : (
                        <p className="mt-3 rounded-md bg-surface-2 px-2 py-1 text-center text-sm text-ink-soft">
                          Changement de plan via le portail en ligne
                        </p>
                      )}
                      <ul className="mt-3 flex flex-col gap-1.5 text-sm">
                        {plan.features.map((feature) => (
                          <li key={feature} className="flex items-center gap-2 text-ink">
                            <Check className="size-4 text-success" aria-hidden="true" />
                            {feature}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}