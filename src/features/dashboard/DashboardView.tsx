"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Banknote,
  CalendarClock,
  CalendarPlus,
  CircleDollarSign,
  ClipboardPlus,
  Hourglass,
  Package,
  PackageOpen,
  Search,
  Shirt,
  Sparkles,
  TrendingDown,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { Badge, Button, Select, StateView, useCountUp } from "@/ui";
import { cx } from "@/lib/cx";
import type { DashboardKpis } from "@/domain/dashboard/kpis";
import { dayDateRange } from "@/domain/dashboard/kpis";
import { formatFcfa } from "@/domain/money";
import { formatCentiUnits } from "@/domain/inventory/units";
import type { SearchHit } from "@/domain/dashboard/search";
import { APPOINTMENT_TYPE_META } from "@/features/appointments/constants";
import { ORDER_STATUS_META } from "@/features/orders/constants";
import { AmbientBlobs } from "@/ui/composites/AppShell";
import { getDashboardFacade } from "./facade";
import { DASHBOARD_PERIOD_OPTIONS, PAYMENT_METHOD_META, SEARCH_ENTITY_LABELS } from "./constants";

type Tone = "flamme" | "azur" | "or" | "wax" | "menthe" | "violet";

const TONES: Record<Tone, { chip: string; glow: string; bar: string }> = {
  flamme: { chip: "from-flamme-300 to-flamme-600", glow: "bg-flamme-400", bar: "from-flamme-300 to-flamme-600" },
  azur: { chip: "from-azur-300 to-azur-600", glow: "bg-azur-500", bar: "from-azur-300 to-azur-600" },
  or: { chip: "from-champagne-300 to-champagne-600", glow: "bg-champagne-400", bar: "from-champagne-300 to-champagne-600" },
  wax: { chip: "from-wax-300 to-wax-600", glow: "bg-wax-500", bar: "from-wax-300 to-wax-600" },
  menthe: { chip: "from-menthe-300 to-menthe-600", glow: "bg-menthe-500", bar: "from-menthe-300 to-menthe-600" },
  violet: { chip: "from-violet-100 to-violet-600", glow: "bg-violet-500", bar: "from-violet-100 to-violet-600" },
};

// Barres : orange, vert et neutres ; le rouge (wax) reste réservé aux alertes.
const BAR_TONES: Tone[] = ["flamme", "menthe", "or", "azur", "flamme", "menthe"];

function AnimatedNumber({ value, format }: { value: number; format: (n: number) => string }) {
  const shown = useCountUp(value);
  return <>{format(shown)}</>;
}

function KpiCard({
  icon,
  title,
  value,
  format = String,
  hint,
  tone,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  value: number;
  format?: (n: number) => string;
  hint?: string | null;
  tone: Tone;
  href?: string;
}) {
  const t = TONES[tone];
  const body = (
    <>
      <span aria-hidden="true" className={cx("absolute -right-8 -top-8 size-28 rounded-full opacity-20 blur-2xl transition-all duration-500 group-hover:scale-150 group-hover:opacity-40", t.glow)} />
      <span className="relative flex items-start justify-between gap-2">
        <span className={cx("grid size-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br text-white shadow-soft transition-transform duration-500 group-hover:rotate-[-10deg] group-hover:scale-110", t.chip)}>
          {icon}
        </span>
        {href ? (
          <ArrowUpRight aria-hidden="true" className="size-4 text-ink-faint transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-flamme-600" />
        ) : null}
      </span>
      <span className="relative mt-4 block text-xs font-semibold uppercase tracking-wider text-ink-soft">{title}</span>
      <span className="relative mt-1 block font-display text-2xl font-extrabold leading-tight text-ink tabular sm:text-[1.65rem]">
        <AnimatedNumber value={value} format={format} />
      </span>
      {hint ? <span className="relative mt-1 block text-xs text-ink-faint">{hint}</span> : null}
    </>
  );
  const className =
    "group gradient-border relative block h-full overflow-hidden rounded-xl border border-outline bg-surface/90 p-4 shadow-soft backdrop-blur transition-all duration-300 hover:-translate-y-1.5 hover:shadow-lift";
  return (
    <li className="min-w-0">
      {href ? (
        <Link href={href} className={className}>
          {body}
        </Link>
      ) : (
        <div className={className}>{body}</div>
      )}
    </li>
  );
}

function Panel({ title, subtitle, children, className }: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cx("gradient-border relative rounded-xl border border-outline bg-surface/90 p-5 shadow-soft backdrop-blur transition-all duration-300 hover:shadow-lift animate-fade-up", className)}>
      <h2 className="font-display text-xl text-ink">{title}</h2>
      {subtitle ? <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-flamme-600">{subtitle}</p> : null}
      {children}
    </section>
  );
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 flex items-center gap-2 rounded-lg border border-dashed border-flamme-200 bg-flamme-50/60 p-3 text-sm text-ink-soft">
      <Sparkles aria-hidden="true" className="size-4 shrink-0 text-flamme-500 animate-float" />
      {children}
    </p>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Bonjour";
  if (hour < 18) return "Bon après-midi";
  return "Bonsoir";
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
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <StateView
          variant="empty"
          title="Tableau de bord non autorisé"
          description="Votre rôle ne permet pas de consulter les statistiques (reports.read)."
        />
      </div>
    );
  }

  const ticker = kpis
    ? [
        `Encaissé : ${formatFcfa(kpis.money.revenuePeriod)}`,
        `Reste à encaisser : ${formatFcfa(kpis.money.outstanding)}`,
        `${kpis.money.ordersActive} commande(s) en cours`,
        `${kpis.money.ordersReadyPickup} prête(s) à retirer`,
        `${kpis.money.ordersLate} en retard`,
        `${kpis.context.appointmentsToday} rendez-vous aujourd'hui`,
        `${kpis.context.customersActive} client(s) actif(s)`,
        `${kpis.context.fabricsLow} tissu(s) en stock bas`,
      ]
    : [];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      {/* Bandeau d'accueil */}
      <section className="dot-grid relative overflow-hidden rounded-xl bg-chocolat-900 p-6 text-ivoire-50 shadow-lift animate-scale-in sm:p-8">
        <AmbientBlobs dark />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0">
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-champagne-300">
              {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
            </p>
            <h1 className="mt-2 font-display text-4xl font-extrabold leading-[1.05] text-ivoire-50 sm:text-5xl">
              {greeting()} <span className="inline-block origin-[70%_70%] animate-wiggle">👋</span>
              <br />
              <span className="text-gradient">votre atelier tourne.</span>
            </h1>
            <p className="mt-3 max-w-md text-sm text-chocolat-200">
              Encaissements, commandes, rendez-vous et stock — tout est ici, même sans réseau.
            </p>
          </div>
          <div className="min-w-0 text-left sm:text-right">
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chocolat-200">Encaissé sur la période</p>
            <p className="mt-1 font-display text-4xl font-extrabold tabular text-champagne-300 sm:text-5xl">
              {kpis ? <AnimatedNumber value={kpis.money.revenuePeriod} format={formatFcfa} /> : "—"}
            </p>
          </div>
        </div>
        <div className="relative mt-6 flex flex-wrap gap-2">
          <Link href="/commandes" className="shine inline-flex h-11 items-center gap-2 rounded-full bg-flamme-gradient px-5 text-sm font-semibold text-white shadow-glow transition-all duration-300 hover:-translate-y-0.5">
            <ClipboardPlus className="size-4" aria-hidden="true" /> Nouvelle commande
          </Link>
          <Link href="/clients" className="inline-flex h-11 items-center gap-2 rounded-full bg-white/10 px-5 text-sm font-semibold text-ivoire-50 backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:bg-azur-500">
            <UserPlus className="size-4" aria-hidden="true" /> Nouveau client
          </Link>
          <Link href="/rdv" className="inline-flex h-11 items-center gap-2 rounded-full bg-white/10 px-5 text-sm font-semibold text-ivoire-50 backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:bg-wax-500">
            <CalendarPlus className="size-4" aria-hidden="true" /> Rendez-vous
          </Link>
        </div>
        {ticker.length > 0 ? (
          <div className="relative -mx-6 mt-6 overflow-hidden border-t border-white/10 pt-4 sm:-mx-8" aria-hidden="true">
            <div className="flex w-max animate-marquee gap-8 whitespace-nowrap font-mono text-xs uppercase tracking-[0.18em] text-chocolat-200">
              {[...ticker, ...ticker].map((item, i) => (
                <span key={i} className="flex items-center gap-8">
                  {item}
                  <span className="text-flamme-400">✦</span>
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {/* Recherche + période */}
      <div className="relative z-20 mt-6 flex flex-wrap items-center justify-between gap-3 animate-fade-up">
        <div className="relative w-full sm:w-96">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-flamme-500"
            aria-hidden="true"
          />
          <input
            aria-label="Rechercher dans l'atelier"
            className="h-12 w-full rounded-full border-2 border-outline bg-surface/90 pl-11 pr-4 text-sm font-medium text-ink shadow-soft backdrop-blur transition-all duration-300 placeholder:text-ink-faint hover:border-flamme-300 focus:border-flamme-500 focus:shadow-[0_0_0_4px_rgb(255_94_46/0.18)] focus:outline-none"
            placeholder="Rechercher… (clients, commandes, tissus)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {results !== null ? (
            <div className="absolute left-0 right-0 z-30 mt-2 flex flex-col gap-1 rounded-xl border border-outline bg-surface p-2 shadow-modal animate-scale-in">
              {searching ? (
                <p className="px-3 py-2 text-sm text-ink-soft">Recherche…</p>
              ) : results.length === 0 ? (
                <p className="px-3 py-2 text-sm text-ink-soft">Aucun résultat.</p>
              ) : (
                results.map((hit) => (
                  <a
                    key={`${hit.kind}-${hit.id}`}
                    href={hit.href}
                    className="flex flex-col rounded-lg px-3 py-2 text-sm transition-all duration-200 hover:translate-x-1 hover:bg-flamme-50"
                  >
                    <span className="flex items-center gap-2">
                      <Badge tone="primary">{SEARCH_ENTITY_LABELS[hit.kind]}</Badge>
                      <span className="truncate font-semibold text-ink">{hit.title}</span>
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
        <div className="flex items-center gap-3">
          {rangeLabel ? (
            <span className="hidden font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft md:inline">{rangeLabel}</span>
          ) : null}
          <Select
            className="w-auto rounded-full"
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
      </div>

      <div className="mt-6">
        {error ? (
          <StateView
            variant="error"
            title="Impossible de charger le tableau de bord"
            description={error}
            action={<Button onClick={() => load().catch(() => undefined)}>Réessayer</Button>}
          />
        ) : loading || kpis === null ? (
          <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Chargement">
            {Array.from({ length: 8 }, (_, i) => (
              <li key={i} className="skeleton-shimmer h-36 rounded-xl" />
            ))}
          </ul>
        ) : (
          <>
            <ul className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiCard tone="menthe" href="/commandes" icon={<Wallet className="size-5" aria-hidden="true" />} title="Encaissé" value={kpis.money.revenuePeriod} format={formatFcfa} hint={`sur ${rangeLabel}`} />
              <KpiCard tone="or" href="/commandes" icon={<Banknote className="size-5" aria-hidden="true" />} title="Facturé" value={kpis.money.invoicedPeriod} format={formatFcfa} hint="commandes créées sur la période" />
              <KpiCard tone="or" href="/commandes" icon={<CircleDollarSign className="size-5" aria-hidden="true" />} title="Reste à encaisser" value={kpis.money.outstanding} format={formatFcfa} hint="hors commandes annulées" />
              <KpiCard tone="wax" href="/commandes" icon={<Hourglass className="size-5" aria-hidden="true" />} title="En retard" value={kpis.money.ordersLate} hint="échéance dépassée, non livrée" />
              <KpiCard tone="flamme" href="/commandes" icon={<Package className="size-5" aria-hidden="true" />} title="Commandes actives" value={kpis.money.ordersActive} hint={`${kpis.money.ordersReadyPickup} à retirer`} />
              <KpiCard tone="azur" href="/clients" icon={<PackageOpen className="size-5" aria-hidden="true" />} title="Clients actifs" value={kpis.context.customersActive} hint={`${kpis.context.customersNewPeriod} nouveaux sur la période`} />
              <KpiCard tone="flamme" href="/rdv" icon={<CalendarClock className="size-5" aria-hidden="true" />} title="Rendez-vous du jour" value={kpis.context.appointmentsToday} hint="planifiés ou confirmés" />
              <KpiCard tone="or" href="/stock" icon={<Shirt className="size-5" aria-hidden="true" />} title="Tissus en stock" value={kpis.context.stockUnitsCenti} format={(n) => `${formatCentiUnits(n)} m`} hint={`${kpis.context.fabricsLow} en stock bas`} />
            </ul>

            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              <Panel title="Encaissements" subtitle={rangeLabel} className="lg:col-span-2">
                {kpis.revenue.every((p) => p.amount === 0) ? (
                  <EmptyLine>Aucun encaissement sur la période — le premier paiement allumera ce graphique.</EmptyLine>
                ) : (
                  <div className="mt-5 flex h-48 items-end gap-2" role="img" aria-label="Barres d'encaissement par période">
                    {kpis.revenue.map((p, i) => {
                      const maxAmount = Math.max(...kpis.revenue.map((x) => x.amount), 1);
                      const h = Math.max(4, Math.round((p.amount / maxAmount) * 100));
                      const tone = TONES[BAR_TONES[i % BAR_TONES.length]];
                      return (
                        <div key={i} className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end">
                          <span className="mb-1 truncate font-mono text-[10px] text-ink-soft opacity-0 transition-opacity group-hover:opacity-100">
                            {formatFcfa(p.amount)}
                          </span>
                          <div
                            className={cx("w-full max-w-12 origin-bottom rounded-t-xl bg-gradient-to-t shadow-soft transition-all duration-300 animate-grow-up group-hover:brightness-110 group-hover:shadow-glow", tone.bar)}
                            style={{ height: `${h}%`, animationDelay: `${i * 70}ms` }}
                            title={`${p.label} : ${formatFcfa(p.amount)}`}
                          />
                          <p className="mt-2 truncate font-mono text-[10px] uppercase text-ink-faint">{p.label}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Panel>

              <Panel title="Règlements par moyen">
                {kpis.paymentsByMethod.length === 0 ? (
                  <EmptyLine>Aucun règlement sur la période.</EmptyLine>
                ) : (
                  <ul className="stagger mt-4 flex flex-col gap-2">
                    {kpis.paymentsByMethod.map((group) => {
                      const meta = PAYMENT_METHOD_META[group.method as keyof typeof PAYMENT_METHOD_META];
                      return (
                        <li
                          key={group.method}
                          className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2.5 text-sm transition-all duration-200 hover:translate-x-1 hover:bg-flamme-50"
                        >
                          <Badge tone={meta?.tone ?? "neutral"}>{meta?.label ?? group.method}</Badge>
                          <span className="ml-auto font-bold tabular text-ink">{formatFcfa(group.amount)}</span>
                          <span className="w-10 text-right font-mono text-xs text-ink-faint">×{group.count}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Panel>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <Panel title="Commandes par statut">
                {kpis.ordersByStatus.length === 0 ? (
                  <EmptyLine>Aucune commande enregistrée.</EmptyLine>
                ) : (
                  <ul className="stagger mt-4 flex flex-col gap-2.5">
                    {kpis.ordersByStatus.map((b, i) => {
                      const meta = ORDER_STATUS_META[b.status];
                      const tone = TONES[BAR_TONES[i % BAR_TONES.length]];
                      return (
                        <li key={b.status} className="flex items-center gap-3 text-sm">
                          <span className="w-32 shrink-0 truncate">
                            <Badge tone={meta.tone}>{meta.label}</Badge>
                          </span>
                          <div className="h-3 flex-1 overflow-hidden rounded-full bg-beige-100">
                            <div
                              className={cx("h-full rounded-full bg-gradient-to-r transition-all duration-1000", tone.bar)}
                              style={{
                                width: `${Math.min(100, Math.round((b.count / (kpis.ordersByStatus[0]?.count ?? 1)) * 100))}%`,
                              }}
                            />
                          </div>
                          <span className="w-6 text-right font-bold tabular text-ink">{b.count}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Panel>

              <Panel title="Rendez-vous par type">
                {kpis.appointmentsByType.length === 0 ? (
                  <EmptyLine>Aucun rendez-vous enregistré.</EmptyLine>
                ) : (
                  <ul className="stagger mt-4 flex flex-col gap-2">
                    {kpis.appointmentsByType.map((b) => {
                      const meta = APPOINTMENT_TYPE_META[b.type];
                      return (
                        <li key={b.type} className="flex items-center gap-3 rounded-lg bg-surface-2 px-3 py-2 text-sm transition-all duration-200 hover:translate-x-1 hover:bg-azur-50">
                          <Badge tone={meta.tone}>{meta.label}</Badge>
                          <span className="ml-auto font-bold tabular text-ink">{b.count}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Panel>
            </div>

            <Panel title="L'atelier en un coup d'œil" className="mt-6">
              <ul className="stagger mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <KpiCard tone="azur" href="/equipe" icon={<Users className="size-5" aria-hidden="true" />} title="Équipe active" value={kpis.context.teamActive} hint="membres opérationnels" />
                <KpiCard tone="azur" href="/stock" icon={<TrendingDown className="size-5" aria-hidden="true" />} title="Sorties stock" value={kpis.context.stockOutPeriodCenti} format={(n) => `${formatCentiUnits(n)} m`} hint="sur la période" />
                <KpiCard tone="or" href="/stock" icon={<Shirt className="size-5" aria-hidden="true" />} title="Stock bas" value={kpis.context.fabricsLow} hint="≤ 1 m (réapprovisionner)" />
                <KpiCard tone="menthe" href="/clients" icon={<UserPlus className="size-5" aria-hidden="true" />} title="Nouveaux clients" value={kpis.context.customersNewPeriod} hint={`sur ${rangeLabel}`} />
              </ul>
            </Panel>
          </>
        )}
      </div>
    </div>
  );
}
