"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Banknote,
  CalendarClock,
  CircleDollarSign,
  Hourglass,
  Package,
  PackageOpen,
  Search,
  Shirt,
  TrendingDown,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { Badge, Button, Select, StateView } from "@/ui";
import type { DashboardKpis } from "@/domain/dashboard/kpis";
import { dayDateRange } from "@/domain/dashboard/kpis";
import { formatFcfa } from "@/domain/money";
import { formatCentiUnits } from "@/domain/inventory/units";
import type { SearchHit } from "@/domain/dashboard/search";
import { APPOINTMENT_TYPE_META } from "@/features/appointments/constants";
import { ORDER_STATUS_META } from "@/features/orders/constants";
import { getDashboardFacade } from "./facade";
import { DASHBOARD_PERIOD_OPTIONS, PAYMENT_METHOD_META, SEARCH_ENTITY_LABELS } from "./constants";

function KpiCard({
  icon,
  title,
  value,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  hint?: string | null;
}) {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-outline bg-surface p-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-beige-100 text-chocolat-800">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs tracking-wide text-ink-soft">{title}</p>
        <p className="font-display text-xl leading-tight text-ink">{value}</p>
        {hint ? <p className="text-xs text-ink-faint">{hint}</p> : null}
      </div>
    </li>
  );
}

export function DashboardView(): React.ReactElement {
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [rangeLabel, setRangeLabel] = useState("");
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);
    try {
      const now = new Date().toISOString();
      const range = dayDateRange(days, now);
      const result = await getDashboardFacade().dashboard.getKpis(range);
      if (!result.ok) {
        setForbidden(true);
        setLoading(false);
        return;
      }
      setKpis(result.kpis);
      setRangeLabel(
        `${new Date(result.range.from).toLocaleDateString("fr-FR")} → ${new Date(
          result.range.to,
        ).toLocaleDateString("fr-FR")}`,
      );
    } catch {
      setError("Impossible de charger le tableau de bord.");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void (async () => {
      try {
        await load();
      } catch {
        // load encode déjà l'erreur
      }
    })();
  }, [load]);

  useEffect(() => {
    const short = search.trim().length < 2;
    const handle = window.setTimeout(async () => {
      if (short) {
        setSearching(false);
        setResults(null);
        return;
      }
      setSearching(true);
      try {
        const hits = await getDashboardFacade().dashboard.search(search);
        setResults(hits);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, short ? 0 : 180);
    return () => window.clearTimeout(handle);
  }, [search]);

  if (forbidden) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:py-10">
        <StateView
          variant="empty"
          title="Tableau de bord non autorisé"
          description="Votre rôle ne permet pas de consulter les statistiques (reports.read)."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-ink sm:text-4xl">Tableau de bord</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Vue d&apos;ensemble de l&apos;atelier, encaissements et activités récentes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint"
              aria-hidden="true"
            />
            <input
              aria-label="Rechercher dans l'atelier"
              className="w-64 max-w-full rounded-md border border-outline bg-surface py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint focus:border-chocolat-600 focus:outline-none"
              placeholder="Rechercher… (clients, commandes…)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {results !== null ? (
              <div className="absolute right-0 z-20 mt-1 flex w-72 flex-col gap-1 rounded-lg border border-outline bg-surface p-2 shadow-md">
                {searching ? (
                  <p className="px-2 py-1 text-sm text-ink-soft">Recherche…</p>
                ) : results.length === 0 ? (
                  <p className="px-2 py-1 text-sm text-ink-soft">Aucun résultat.</p>
                ) : (
                  results.map((hit) => (
                    <a
                      key={`${hit.kind}-${hit.id}`}
                      href={hit.href}
                      className="flex flex-col rounded-md px-2 py-1.5 text-sm hover:bg-beige-50"
                    >
                      <span className="flex items-center gap-2">
                        <Badge tone="neutral">{SEARCH_ENTITY_LABELS[hit.kind]}</Badge>
                        <span className="truncate font-medium text-ink">{hit.title}</span>
                      </span>
                      {hit.subtitle ? (
                        <span className="truncate pl-1 text-xs text-ink-faint">{hit.subtitle}</span>
                      ) : null}
                    </a>
                  ))
                )}
              </div>
            ) : null}
          </div>
          <Select
            className="w-auto"
            aria-label="Période du tableau de bord"
            value={String(days)}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            {DASHBOARD_PERIOD_OPTIONS.map((p) => (
              <option key={p.days} value={p.days}>
                {p.label}
              </option>
            ))}
          </Select>
        </div>
      </header>

      <main className="mt-8">
        {error ? (
          <StateView
            variant="error"
            title="Impossible de charger le tableau de bord"
            description={error}
            action={<Button onClick={() => load().catch(() => undefined)}>Réessayer</Button>}
          />
        ) : loading || kpis === null ? (
          <StateView variant="loading" title="Chargement du tableau de bord…" />
        ) : (
          <>
            <p className="mb-4 text-sm text-ink-faint">Période affichée : {rangeLabel}</p>

            <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiCard
                icon={<Wallet className="size-5" aria-hidden="true" />}
                title="Encaissé (période)"
                value={formatFcfa(kpis.money.revenuePeriod)}
                hint={`sur ${rangeLabel}`}
              />
              <KpiCard
                icon={<Banknote className="size-5" aria-hidden="true" />}
                title="Facturé (période)"
                value={formatFcfa(kpis.money.invoicedPeriod)}
                hint="commandes créées sur la période"
              />
              <KpiCard
                icon={<CircleDollarSign className="size-5" aria-hidden="true" />}
                title="Reste à encaisser"
                value={formatFcfa(kpis.money.outstanding)}
                hint="hors commandes annulées"
              />
              <KpiCard
                icon={<Hourglass className="size-5" aria-hidden="true" />}
                title="Commandes en retard"
                value={String(kpis.money.ordersLate)}
                hint="échéance dépassée, non livrée"
              />
              <KpiCard
                icon={<Package className="size-5" aria-hidden="true" />}
                title="Commandes actives"
                value={String(kpis.money.ordersActive)}
                hint={`${kpis.money.ordersReadyPickup} à retirer`}
              />
              <KpiCard
                icon={<PackageOpen className="size-5" aria-hidden="true" />}
                title="Clients actifs"
                value={String(kpis.context.customersActive)}
                hint={`${kpis.context.customersNewPeriod} nouveaux sur la période`}
              />
              <KpiCard
                icon={<CalendarClock className="size-5" aria-hidden="true" />}
                title="Rendez-vous aujourd'hui"
                value={String(kpis.context.appointmentsToday)}
                hint="planifiés ou confirmés"
              />
              <KpiCard
                icon={<Shirt className="size-5" aria-hidden="true" />}
                title="Tissus"
                value={`${formatCentiUnits(kpis.context.stockUnitsCenti)} m`}
                hint={`${kpis.context.fabricsLow} en stock bas · ${formatCentiUnits(kpis.context.stockOutPeriodCenti)} m sortis`}
              />
            </ul>

            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              <section className="rounded-lg border border-outline bg-surface p-4 lg:col-span-2">
                <h2 className="font-display text-lg text-ink">Encaissements — période</h2>
                <p className="text-xs text-ink-faint">{rangeLabel}</p>
                {kpis.revenue.every((p) => p.amount === 0) ? (
                  <p className="mt-4 rounded-md bg-surface-2 p-3 text-sm text-ink-soft">
                    Aucun encaissement sur la période.
                  </p>
                ) : (
                  <div className="mt-3">
                    <svg viewBox="0 0 700 160" className="w-full overflow-visible">
                      {kpis.revenue.map((p, i) => (
                        <text
                          key={p.label}
                          x={i * 100 + 50}
                          y={155}
                          textAnchor="middle"
                          className="fill-ink-faint text-xs"
                        >
                          {p.label}
                        </text>
                      ))}
                    </svg>
                    <div className="mt-1 flex items-end gap-1" role="img" aria-label="Barres d'encaisse par période">
                      {kpis.revenue.map((p, i) => {
                        const maxAmount = Math.max(...kpis.revenue.map((x) => x.amount), 1);
                        const h = Math.round((p.amount / maxAmount) * 110);
                        return (
                          <div key={i} className="flex-1 text-center">
                            <div
                              className="mx-auto w-full max-w-10 rounded-t-sm bg-chocolat-500 opacity-85 transition-opacity hover:opacity-100"
                              style={{ height: `${Math.max(h, 2)}px` }}
                              title={`${p.label} : ${formatFcfa(p.amount)}`}
                            />
                            <p className="mt-1 text-[0.65rem] text-ink-faint">
                              {formatFcfa(p.amount)}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>

              <section className="rounded-lg border border-outline bg-surface p-4">
                <h2 className="font-display text-lg text-ink">Règlements par moyen</h2>
                {kpis.paymentsByMethod.length === 0 ? (
                  <p className="mt-4 rounded-md bg-surface-2 p-3 text-sm text-ink-soft">
                    Aucun règlement sur la période.
                  </p>
                ) : (
                  <ul className="mt-3 flex flex-col gap-2">
                    {kpis.paymentsByMethod.map((group) => {
                      const meta = PAYMENT_METHOD_META[group.method as keyof typeof PAYMENT_METHOD_META];
                      return (
                        <li
                          key={group.method}
                          className="flex items-center gap-2 rounded-md bg-surface-2 px-2.5 py-2 text-sm"
                        >
                          <Badge tone={meta?.tone ?? "neutral"}>
                            {meta?.label ?? group.method}
                          </Badge>
                          <span className="ml-auto font-medium text-ink">
                            {formatFcfa(group.amount)}
                          </span>
                          <span className="w-10 text-right text-xs text-ink-faint">
                            ×{group.count}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <section className="rounded-lg border border-outline bg-surface p-4">
                <h2 className="font-display text-lg text-ink">Commandes par statut</h2>
                {kpis.ordersByStatus.length === 0 ? (
                  <p className="mt-4 rounded-md bg-surface-2 p-3 text-sm text-ink-soft">
                    Aucune commande enregistrée.
                  </p>
                ) : (
                  <ul className="mt-3 flex flex-col gap-1.5">
                    {kpis.ordersByStatus.map((b) => {
                      const meta = ORDER_STATUS_META[b.status];
                      return (
                        <li key={b.status} className="flex items-center gap-3 text-sm">
                          <span className="w-32 shrink-0 truncate">
                            <Badge tone={meta.tone}>{meta.label}</Badge>
                          </span>
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-beige-100">
                            <div
                              className="h-full rounded-full bg-champagne-400"
                              style={{
                                width: `${Math.min(
                                  100,
                                  Math.round((b.count / (kpis.ordersByStatus[0]?.count ?? 1)) * 100),
                                )}%`,
                              }}
                            />
                          </div>
                          <span className="w-6 text-right font-medium text-ink">{b.count}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section className="rounded-lg border border-outline bg-surface p-4">
                <h2 className="font-display text-lg text-ink">Rendez-vous par type</h2>
                {kpis.appointmentsByType.length === 0 ? (
                  <p className="mt-4 rounded-md bg-surface-2 p-3 text-sm text-ink-soft">
                    Aucun rendez-vous enregistré.
                  </p>
                ) : (
                  <ul className="mt-3 flex flex-col gap-2">
                    {kpis.appointmentsByType.map((b) => {
                      const meta = APPOINTMENT_TYPE_META[b.type];
                      return (
                        <li key={b.type} className="flex items-center gap-3 text-sm">
                          <Badge tone={meta.tone}>{meta.label}</Badge>
                          <span className="ml-auto font-medium text-ink">{b.count}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>

            <section className="mt-6 rounded-lg border border-outline bg-surface p-4">
              <h2 className="font-display text-lg text-ink">Atelier</h2>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <KpiCard
                  icon={<Users className="size-5" aria-hidden="true" />}
                  title="Équipe active"
                  value={String(kpis.context.teamActive)}
                  hint="adhérents opérationnels"
                />
                <KpiCard
                  icon={<TrendingDown className="size-5" aria-hidden="true" />}
                  title="Sorties stock (période)"
                  value={`${formatCentiUnits(kpis.context.stockOutPeriodCenti)} m`}
                  hint="mouvements OUT"
                />
                <KpiCard
                  icon={<Shirt className="size-5" aria-hidden="true" />}
                  title="Tissus en stock bas"
                  value={String(kpis.context.fabricsLow)}
                  hint="≤ 1 m (réapprovisionner)"
                />
                <KpiCard
                  icon={<UserPlus className="size-5" aria-hidden="true" />}
                  title="Nouveaux clients"
                  value={String(kpis.context.customersNewPeriod)}
                  hint={`sur ${rangeLabel}`}
                />
              </ul>
            </section>
          </>
        )}
      </main>
    </div>
  );
}