"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { formatLimit, formatPrice } from "@/domain/subscriptions/entitlements";
import { getSupabaseBrowserClient } from "@/infrastructure/supabase/browserClient";

interface PublicPlan {
  code: string;
  name: string;
  description: string | null;
  priceMonthly: number;
  currency: string;
  trialDays: number;
  limits: Record<string, unknown>;
}

function parse(rows: unknown): PublicPlan[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((r: Record<string, unknown>) => ({
    code: String(r.code),
    name: String(r.name ?? r.code),
    description: typeof r.description === "string" ? r.description : null,
    priceMonthly: Number(r.price_monthly ?? 0),
    currency: String(r.currency ?? "XOF"),
    trialDays: Number(r.trial_days ?? 0),
    limits: (r.limits ?? {}) as Record<string, unknown>,
  }));
}

const lim = (v: unknown) => (typeof v === "number" ? v : null);

/** Tarifs lus en direct (public_plans) : la vitrine suit les prix fixés dans « Plateforme ». */
export function PublicPricing(): React.ReactElement {
  const [plans, setPlans] = useState<PublicPlan[] | null>(null);

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) {
      void Promise.resolve().then(() => setPlans([]));
      return;
    }
    void client.rpc("public_plans").then(({ data, error }) => setPlans(error ? [] : parse(data)));
  }, []);

  if (plans === null) {
    return <div className="mt-12 h-64 animate-pulse rounded-2xl bg-white/5" aria-label="Chargement des tarifs" />;
  }
  if (plans.length === 0) {
    return (
      <p className="mt-10 max-w-xl text-ivoire-50/65">
        Les tarifs s&apos;affichent après la création de votre compte, avec un essai gratuit.
      </p>
    );
  }
  return (
    <div className="mt-12 grid gap-5 lg:grid-cols-3">
      {plans.map((plan) => {
        const featured = plan.code === "PRO";
        const count = (v: unknown, some: string, all: string) => {
          const n = lim(v);
          return n === null ? all : `${formatLimit(n)} ${some}`;
        };
        const features = [
          count(plan.limits.customers_max, "clients", "Clients illimités"),
          count(plan.limits.orders_max, "commandes en cours", "Commandes illimitées"),
          count(plan.limits.users_max, "utilisateurs", "Utilisateurs illimités"),
          lim(plan.limits.storage_mb) === null ? "Photos et reçus illimités" : `${formatLimit(lim(plan.limits.storage_mb), "Mo")} de photos et reçus`,
          ...(plan.limits.whatsapp ? ["Rappels WhatsApp"] : []),
          ...(plan.limits.stock ? ["Stock de tissus"] : []),
        ];
        return (
          <article
            key={plan.code}
            className={
              "flex flex-col rounded-2xl border p-7 " +
              (featured ? "border-flamme-500 bg-flamme-500/10 shadow-[0_0_0_1px_var(--color-flamme-500)]" : "border-white/10 bg-white/5")
            }
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-xl font-bold text-ivoire-50">{plan.name}</h3>
              {featured ? (
                <span className="rounded-full bg-flamme-500 px-2.5 py-0.5 text-xs font-semibold text-white">Recommandé</span>
              ) : null}
            </div>
            {plan.description ? <p className="mt-1 text-sm text-ivoire-50/60">{plan.description}</p> : null}
            <p className="mt-5 font-display text-3xl font-extrabold text-ivoire-50">
              {formatPrice(plan.priceMonthly, plan.currency)}
              {plan.priceMonthly > 0 ? <span className="text-sm font-normal text-ivoire-50/50"> / mois</span> : null}
            </p>
            <ul className="mt-6 flex-1 space-y-2 text-sm text-ivoire-50/75">
              {features.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-flamme-400" aria-hidden="true" />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href="/connexion?inscription=1"
              className={
                "mt-7 inline-flex h-12 items-center justify-center rounded-xl px-6 font-display text-sm font-semibold transition-colors " +
                (featured ? "bg-flamme-500 text-white hover:bg-flamme-600" : "border border-ivoire-50/20 text-ivoire-50 hover:bg-white/5")
              }
            >
              {plan.priceMonthly > 0 ? "Essayer gratuitement" : "Commencer"}
            </Link>
          </article>
        );
      })}
    </div>
  );
}
