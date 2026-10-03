"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Building2, Pencil, Search } from "lucide-react";
import { Badge, Button, Dialog, Field, Input, Select, StateView, Switch, type BadgeTone } from "@/ui";
import { cx } from "@/lib/cx";
import {
  daysLeft,
  FEATURE_LABELS,
  formatLimit,
  formatPrice,
  parseEntitlements,
  STATUS_LABELS,
  type EntitlementStatus,
  type FeatureFlag,
  type PlanInfo,
  type PlanLimits,
} from "@/domain/subscriptions/entitlements";
import { getSupabaseBrowserClient } from "@/infrastructure/supabase/browserClient";
import {
  createPlatformRemote,
  type PlatformRemote,
  type PlatformTenant,
} from "@/infrastructure/subscriptions/subscriptionRemote";

/**
 * Administration de la plateforme (SAAS_ADMIN) : abonnements des ateliers
 * et catalogue des plans. Ne montre jamais de données métier : seulement
 * des compteurs. Toutes les actions sont revérifiées par la base (0022).
 */
const STATUS_TONES: Record<EntitlementStatus, BadgeTone> = {
  TRIAL: "info",
  ACTIVE: "success",
  GRACE: "warning",
  EXPIRED: "danger",
  NONE: "neutral",
};
const FEATURES: FeatureFlag[] = ["whatsapp", "stock", "audit"];
const DURATIONS = [
  { value: "1", label: "1 mois" },
  { value: "3", label: "3 mois" },
  { value: "6", label: "6 mois" },
  { value: "12", label: "12 mois" },
  { value: "none", label: "Sans échéance" },
];

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—";
}

function errorText(e: unknown): string {
  const raw = e instanceof Error ? e.message : "";
  if (raw.startsWith("FORBIDDEN")) return "Action réservée à l'administration de la plateforme.";
  if (raw.startsWith("VALIDATION")) return "Valeurs invalides : vérifiez les champs.";
  if (raw.startsWith("NOT_FOUND")) return "Élément introuvable.";
  return navigator.onLine ? "L'opération a échoué. Réessayez." : "Connexion Internet requise.";
}

async function loadPlans(): Promise<PlanInfo[]> {
  const client = getSupabaseBrowserClient();
  if (!client) return [];
  const { data, error } = await client.from("plans").select("*").order("sort_order");
  if (error) throw new Error(error.message);
  const parsed = parseEntitlements({ plan_code: "_", plans: data ?? [] });
  return parsed?.plans ?? [];
}

export function PlatformView(): React.ReactElement {
  const remote = useMemo<PlatformRemote | null>(() => {
    const client = getSupabaseBrowserClient();
    return client ? createPlatformRemote(client) : null;
  }, []);
  const [tenants, setTenants] = useState<PlatformTenant[] | null>(null);
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [query, setQuery] = useState("");
  const [managing, setManaging] = useState<PlatformTenant | null>(null);
  const [editing, setEditing] = useState<PlanInfo | null>(null);

  const load = useCallback(async () => {
    if (!remote) return;
    setError(null);
    try {
      const [list, catalogue] = await Promise.all([remote.listTenants(), loadPlans()]);
      setTenants(list);
      setPlans(catalogue);
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("FORBIDDEN")) setForbidden(true);
      else setError(errorText(e));
    }
  }, [remote]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = tenants ?? [];
    const filtered = q
      ? list.filter((t) => t.name.toLowerCase().includes(q) || (t.ownerEmail ?? "").toLowerCase().includes(q))
      : list;
    // demandes en attente d'abord
    return [...filtered].sort((a, b) => Number(Boolean(b.entitlements.requestedPlanCode)) - Number(Boolean(a.entitlements.requestedPlanCode)));
  }, [tenants, query]);

  if (!remote || forbidden) {
    return (
      <Page>
        <StateView variant="empty" title="Accès réservé" description="Cette page est réservée à l'administration de la plateforme." />
      </Page>
    );
  }

  const requests = (tenants ?? []).filter((t) => t.entitlements.requestedPlanCode).length;

  return (
    <Page>
      {error ? (
        <StateView variant="error" title="Chargement impossible" description={error} action={<Button onClick={() => void load()}>Réessayer</Button>} />
      ) : tenants === null ? (
        <StateView variant="loading" title="Chargement des ateliers…" />
      ) : (
        <>
          <section className="animate-fade-up">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 className="font-display text-xl text-ink">
                Ateliers <span className="text-ink-faint">({tenants.length})</span>
              </h2>
              {requests > 0 ? <Badge tone="warning" dot>{requests} demande{requests > 1 ? "s" : ""} de plan</Badge> : null}
            </div>
            <div className="relative mt-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" aria-hidden="true" />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher un atelier ou un e-mail"
                aria-label="Rechercher un atelier"
                className="pl-9"
              />
            </div>
            <ul className="mt-4 grid grid-cols-1 gap-3 @3xl:grid-cols-2">
              {visible.map((t) => {
                const e = t.entitlements;
                const end = e.status === "TRIAL" ? e.trialEndsAt : e.periodEnd;
                const left = daysLeft(end);
                return (
                  <li key={t.id} className={cx("rounded-lg border bg-surface p-4 shadow-soft", e.requestedPlanCode ? "border-warning" : "border-outline")}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-display text-lg text-ink">{t.name}</p>
                        <p className="truncate text-xs text-ink-faint">{t.ownerEmail ?? "—"} · créé le {formatDate(t.createdAt)}</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => setManaging(t)}>
                        Gérer
                      </Button>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                      <Badge tone="primary">{e.planName}</Badge>
                      <Badge tone={STATUS_TONES[e.status]}>{STATUS_LABELS[e.status]}</Badge>
                      {end ? (
                        <span className="text-ink-soft">
                          {e.status === "TRIAL" ? "essai jusqu'au" : "jusqu'au"} {formatDate(end)}
                          {left !== null && left <= 7 ? ` (${left} j)` : ""}
                        </span>
                      ) : null}
                    </div>
                    {e.requestedPlanCode ? (
                      <p className="mt-2 rounded-md bg-warning-soft px-2 py-1 text-sm text-warning">
                        Demande : plan {plans.find((p) => p.code === e.requestedPlanCode)?.name ?? e.requestedPlanCode} le {formatDate(e.requestedAt)}
                      </p>
                    ) : null}
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-ink-soft @md:grid-cols-4">
                      <div><dt>Clients</dt><dd className="font-medium text-ink">{e.usage.customers}</dd></div>
                      <div><dt>Commandes</dt><dd className="font-medium text-ink">{e.usage.orders}</dd></div>
                      <div><dt>Utilisateurs</dt><dd className="font-medium text-ink">{e.usage.users}</dd></div>
                      <div><dt>Stockage</dt><dd className="font-medium text-ink">{formatLimit(Math.ceil(e.usage.storageBytes / (1024 * 1024)), "Mo")}</dd></div>
                    </dl>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="mt-10 animate-fade-up">
            <h2 className="font-display text-xl text-ink">Plans</h2>
            <p className="mt-1 text-sm text-ink-soft">
              Prix et limites modifiables à tout moment. Un abonnement en cours garde son prix jusqu&apos;au prochain renouvellement.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-3 @2xl:grid-cols-3">
              {plans.map((plan) => (
                <article key={plan.code} className="rounded-lg border border-outline bg-surface p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-display text-lg text-ink">{plan.name}</h3>
                      <p className="text-xs text-ink-faint">{plan.code}{plan.isDefault ? " · plan par défaut" : ""}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setEditing(plan)} aria-label={`Modifier ${plan.name}`}>
                      <Pencil className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                  <p className="mt-2 font-display text-xl text-ink">{formatPrice(plan.priceMonthly, plan.currency)}</p>
                  <p className="mt-1 text-xs text-ink-soft">
                    {formatLimit(plan.limits.customers_max)} clients · {formatLimit(plan.limits.orders_max)} commandes ·{" "}
                    {formatLimit(plan.limits.users_max)} utilisateurs · {formatLimit(plan.limits.storage_mb, "Mo")}
                    {plan.trialDays > 0 ? ` · essai ${plan.trialDays} j` : ""}
                  </p>
                </article>
              ))}
            </div>
          </section>
        </>
      )}

      {managing ? (
        <ManageDialog tenant={managing} plans={plans} remote={remote} onClose={() => setManaging(null)} onDone={() => { setManaging(null); void load(); }} />
      ) : null}
      {editing ? (
        <PlanDialog plan={editing} remote={remote} onClose={() => setEditing(null)} onDone={() => { setEditing(null); void load(); }} />
      ) : null}
    </Page>
  );
}

function ManageDialog({
  tenant,
  plans,
  remote,
  onClose,
  onDone,
}: {
  tenant: PlatformTenant;
  plans: PlanInfo[];
  remote: PlatformRemote;
  onClose: () => void;
  onDone: () => void;
}) {
  const e = tenant.entitlements;
  const [planCode, setPlanCode] = useState(e.requestedPlanCode ?? e.subscribedPlanCode ?? e.planCode);
  const [mode, setMode] = useState<"paid" | "trial">("paid");
  const [duration, setDuration] = useState("1");
  const [trialDays, setTrialDays] = useState("14");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const plan = plans.find((p) => p.code === planCode);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await remote.setSubscription({
        tenantId: tenant.id,
        planCode,
        months: mode === "paid" && duration !== "none" ? Number(duration) : null,
        trialDays: mode === "trial" ? Number(trialDays) : null,
      });
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={busy ? () => undefined : onClose}
      title={tenant.name}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Annuler</Button>
          <Button type="submit" form="manage-subscription" loading={busy}>
            {mode === "paid" ? "Activer le plan" : "Accorder l'essai"}
          </Button>
        </>
      }
    >
      <form id="manage-subscription" onSubmit={(ev) => void submit(ev)} className="flex flex-col gap-4">
        <p className="text-sm text-ink-soft">
          Actuellement : {e.planName} ({STATUS_LABELS[e.status].toLowerCase()}).
          {e.requestedPlanCode ? ` Demande en attente : ${plans.find((p) => p.code === e.requestedPlanCode)?.name ?? e.requestedPlanCode}.` : ""}
        </p>
        <Field label="Plan" htmlFor="manage-plan">
          <Select id="manage-plan" value={planCode} onChange={(ev) => setPlanCode(ev.target.value)}>
            {plans.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name} — {formatPrice(p.priceMonthly, p.currency)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Type" htmlFor="manage-mode">
          <Select id="manage-mode" value={mode} onChange={(ev) => setMode(ev.target.value as "paid" | "trial")}>
            <option value="paid">Abonnement payé</option>
            <option value="trial">Essai gratuit</option>
          </Select>
        </Field>
        {mode === "paid" ? (
          <Field label="Durée" htmlFor="manage-duration" hint={plan && plan.priceMonthly > 0 && duration !== "none" ? `Montant attendu : ${formatPrice(plan.priceMonthly * Number(duration), plan.currency)}` : undefined}>
            <Select id="manage-duration" value={duration} onChange={(ev) => setDuration(ev.target.value)}>
              {DURATIONS.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label="Jours d'essai" htmlFor="manage-trial">
            <Input id="manage-trial" type="number" inputMode="numeric" min={1} max={365} value={trialDays} onChange={(ev) => setTrialDays(ev.target.value)} required />
          </Field>
        )}
        {error ? <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p> : null}
      </form>
    </Dialog>
  );
}

type LimitField = "customers_max" | "orders_max" | "users_max" | "storage_mb";
const LIMIT_FIELDS: { key: LimitField; label: string }[] = [
  { key: "customers_max", label: "Clients" },
  { key: "orders_max", label: "Commandes en cours" },
  { key: "users_max", label: "Utilisateurs" },
  { key: "storage_mb", label: "Stockage (Mo)" },
];

function PlanDialog({ plan, remote, onClose, onDone }: { plan: PlanInfo; remote: PlatformRemote; onClose: () => void; onDone: () => void }) {
  const [price, setPrice] = useState(String(plan.priceMonthly));
  const [trial, setTrial] = useState(String(plan.trialDays));
  const [limits, setLimits] = useState<Record<LimitField, string>>({
    customers_max: plan.limits.customers_max === null ? "" : String(plan.limits.customers_max),
    orders_max: plan.limits.orders_max === null ? "" : String(plan.limits.orders_max),
    users_max: plan.limits.users_max === null ? "" : String(plan.limits.users_max),
    storage_mb: plan.limits.storage_mb === null ? "" : String(plan.limits.storage_mb),
  });
  const [flags, setFlags] = useState<Record<FeatureFlag, boolean>>({ whatsapp: plan.limits.whatsapp, stock: plan.limits.stock, audit: plan.limits.audit });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(/\s/g, "")));
    const next: PlanLimits = {
      customers_max: num(limits.customers_max),
      orders_max: num(limits.orders_max),
      users_max: num(limits.users_max),
      storage_mb: num(limits.storage_mb),
      ...flags,
    };
    const priceValue = Number(price.replace(/\s/g, ""));
    const values = [priceValue, Number(trial), ...LIMIT_FIELDS.map((f) => next[f.key] ?? 0)];
    if (values.some((v) => !Number.isSafeInteger(v) || v < 0)) {
      setError("Entrez des nombres entiers positifs (laisser vide = illimité).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await remote.updatePlan({ code: plan.code, priceMonthly: priceValue, limits: next, trialDays: Number(trial) });
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={busy ? () => undefined : onClose}
      title={`Plan ${plan.name}`}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Annuler</Button>
          <Button type="submit" form="edit-plan" loading={busy}>Enregistrer</Button>
        </>
      }
    >
      <form id="edit-plan" onSubmit={(ev) => void submit(ev)} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Prix mensuel (F CFA)" htmlFor="plan-price">
            <Input id="plan-price" inputMode="numeric" value={price} onChange={(ev) => setPrice(ev.target.value)} required />
          </Field>
          <Field label="Essai offert (jours)" htmlFor="plan-trial" hint="0 = pas d'essai sur ce plan">
            <Input id="plan-trial" type="number" inputMode="numeric" min={0} max={365} value={trial} onChange={(ev) => setTrial(ev.target.value)} required />
          </Field>
          {LIMIT_FIELDS.map((f) => (
            <Field key={f.key} label={f.label} htmlFor={`plan-${f.key}`} hint="Vide = illimité">
              <Input id={`plan-${f.key}`} inputMode="numeric" value={limits[f.key]} onChange={(ev) => setLimits((l) => ({ ...l, [f.key]: ev.target.value }))} />
            </Field>
          ))}
        </div>
        <ul className="flex flex-col gap-1">
          {FEATURES.map((f) => (
            <li key={f} className="flex items-center justify-between gap-3 text-sm text-ink">
              <span>{FEATURE_LABELS[f]}</span>
              <Switch checked={flags[f]} onChange={(ev) => setFlags((x) => ({ ...x, [f]: ev.target.checked }))} aria-label={FEATURE_LABELS[f]} />
            </li>
          ))}
        </ul>
        {error ? <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p> : null}
      </form>
    </Dialog>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div className="@container mx-auto w-full max-w-5xl px-4 py-6 sm:py-10">
      <header className="mb-8 flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-ocean-gradient text-white shadow-soft">
          <Building2 className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h1 className="page-title text-4xl text-ink sm:text-5xl">Plateforme</h1>
          <p className="mt-1 text-sm text-ink-soft">Abonnements des ateliers et catalogue des plans.</p>
        </div>
      </header>
      {children}
    </div>
  );
}
