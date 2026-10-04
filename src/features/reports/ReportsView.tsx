"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, TrendingDown, TrendingUp } from "lucide-react";
import { Badge, Button, Select, StateView } from "@/ui";
import { cx } from "@/lib/cx";
import { formatMoney, getActiveCurrency } from "@/domain/money";
import type { Customer } from "@/domain/clients/customer";
import type { OrderRecord } from "@/domain/orders/order";
import type { PaymentRecord } from "@/domain/orders/payments";
import {
  buildMonthlyReport,
  evolutionPercent,
  monthKeyOf,
  monthLabel,
  monthlyReportCsv,
  monthlyReportFileName,
  recentMonths,
  shiftMonth,
  type MonthKey,
} from "@/domain/reports/monthly";
import { getDashboardFacade } from "@/features/dashboard/facade";
import { PAYMENT_METHOD_META } from "@/features/dashboard/constants";
import { useAtelierIdentity } from "@/features/orders/useAtelierIdentity";
import { useDataChanged } from "@/features/sync/useDataChanged";

interface Sources {
  orders: OrderRecord[];
  payments: PaymentRecord[];
  customers: Customer[];
}

function Stat({ title, value, hint, tone = "ink" }: { title: string; value: string; hint?: React.ReactNode; tone?: "ink" | "green" | "orange" | "red" }) {
  return (
    <li className="gradient-border @container relative min-w-0 rounded-xl border border-outline bg-surface/90 p-4 shadow-soft">
      <span className="block text-xs font-semibold uppercase tracking-wider text-ink-soft">{title}</span>
      <span
        className={cx(
          "mt-1 block font-display text-[clamp(1.15rem,12cqi,1.6rem)] font-extrabold leading-tight tabular",
          tone === "green" ? "text-menthe-700" : tone === "orange" ? "text-flamme-700" : tone === "red" ? "text-wax-700" : "text-ink",
        )}
      >
        {value}
      </span>
      {hint ? <span className="mt-1 block text-xs text-ink-faint">{hint}</span> : null}
    </li>
  );
}

function Panel({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-xl border border-outline bg-surface/90 p-5 shadow-soft", className)}>
      <h2 className="font-display text-xl text-ink">{title}</h2>
      {children}
    </section>
  );
}

/** Rapport du mois : calculé sur l'appareil, exportable pour Excel. */
export function ReportsView(): React.ReactElement {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const current = useMemo(() => monthKeyOf(new Date().toISOString(), timeZone), [timeZone]);
  const [month, setMonth] = useState<MonthKey>(current);
  const [sources, setSources] = useState<Sources | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { identity } = useAtelierIdentity();

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await getDashboardFacade().dashboard.getReportSources();
      if (!result.ok) {
        setForbidden(true);
        return;
      }
      setSources({ orders: result.orders, payments: result.payments, customers: result.customers });
    } catch {
      setError("Impossible de lire les données de l'atelier.");
    }
  }, []);
  useDataChanged(load);
  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const report = useMemo(
    () => (sources ? buildMonthlyReport({ month, ...sources, timeZone }) : null),
    [sources, month, timeZone],
  );
  const months = useMemo(() => recentMonths(current, 24), [current]);
  const money = (n: number) => formatMoney(n);

  function exportCsv() {
    if (!report) return;
    const csv = monthlyReportCsv(report, {
      atelierName: identity?.name ?? "Atelier",
      currency: getActiveCurrency(),
      methodLabel: (m) => PAYMENT_METHOD_META[m]?.label ?? m,
      timeZone,
    });
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = monthlyReportFileName(report.month);
    document.body.append(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  if (forbidden) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:py-10">
        <StateView variant="empty" title="Rapports non autorisés" description="Votre rôle ne permet pas de consulter les chiffres de l'atelier." />
      </div>
    );
  }

  const evolution = report ? evolutionPercent(report.collected, report.previousCollected) : null;
  const maxDay = report ? Math.max(1, ...report.daily) : 1;

  return (
    <div className="@container mx-auto w-full max-w-6xl px-4 py-6 sm:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title text-4xl text-ink sm:text-5xl">Rapports</h1>
          <p className="mt-1 text-sm text-ink-soft">Les chiffres du mois, à garder ou à envoyer à votre comptable.</p>
        </div>
        <Button onClick={exportCsv} disabled={!report}>
          <Download className="size-4" aria-hidden="true" />
          Exporter pour Excel
        </Button>
      </header>

      <div className="mt-6 flex items-center gap-2">
        <button
          type="button"
          aria-label="Mois précédent"
          onClick={() => setMonth((m) => shiftMonth(m, -1))}
          disabled={month === months[months.length - 1]}
          className="grid size-11 shrink-0 place-items-center rounded-full border border-outline bg-surface text-ink-soft transition-all hover:border-flamme-300 hover:text-flamme-700 disabled:opacity-40"
        >
          <ChevronLeft className="size-5" aria-hidden="true" />
        </button>
        <Select className="w-auto min-w-48 rounded-full capitalize" aria-label="Mois du rapport" value={month} onChange={(e) => setMonth(e.target.value)}>
          {months.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </Select>
        <button
          type="button"
          aria-label="Mois suivant"
          onClick={() => setMonth((m) => shiftMonth(m, 1))}
          disabled={month === current}
          className="grid size-11 shrink-0 place-items-center rounded-full border border-outline bg-surface text-ink-soft transition-all hover:border-flamme-300 hover:text-flamme-700 disabled:opacity-40"
        >
          <ChevronRight className="size-5" aria-hidden="true" />
        </button>
      </div>

      <main className="mt-6 flex flex-col gap-6">
        {error ? (
          <StateView variant="error" title="Rapport indisponible" description={error} action={<Button onClick={() => void load()}>Réessayer</Button>} />
        ) : !report ? (
          <ul className="grid grid-cols-2 gap-3 @4xl:grid-cols-4" aria-label="Chargement">
            {Array.from({ length: 8 }, (_, i) => (
              <li key={i} className="skeleton-shimmer h-28 rounded-xl" />
            ))}
          </ul>
        ) : (
          <>
            <ul className="stagger grid grid-cols-2 gap-3 @4xl:grid-cols-4">
              <Stat
                title="Encaissé"
                tone="green"
                value={money(report.collected)}
                hint={
                  evolution === null ? (
                    `${report.paymentsCount} paiement(s)`
                  ) : (
                    <span className={cx("inline-flex items-center gap-1 font-semibold", evolution >= 0 ? "text-menthe-700" : "text-wax-700")}>
                      {evolution >= 0 ? <TrendingUp className="size-3.5" aria-hidden="true" /> : <TrendingDown className="size-3.5" aria-hidden="true" />}
                      {evolution >= 0 ? "+" : ""}
                      {evolution} % par rapport au mois précédent
                    </span>
                  )
                }
              />
              <Stat title="Facturé" value={money(report.invoiced)} hint={`${report.ordersCreated} commande(s) créée(s)`} />
              <Stat title="Reste à encaisser" tone="orange" value={money(report.outstandingFromMonth)} hint="sur les commandes du mois" />
              <Stat title="Commandes livrées" value={String(report.ordersDelivered)} hint={report.ordersCancelled ? `${report.ordersCancelled} annulée(s)` : "aucune annulée"} />
            </ul>

            <Panel title="Encaissements jour par jour">
              {report.collected === 0 ? (
                <p className="mt-3 text-sm text-ink-soft">Aucun paiement enregistré ce mois-ci.</p>
              ) : (
                <div className="mt-5 flex h-44 items-end gap-[2px] sm:gap-1" role="img" aria-label={`Encaissements de ${monthLabel(report.month)}, jour par jour`}>
                  {report.daily.map((amount, i) => (
                    <div key={i} className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end" title={`${i + 1} : ${money(amount)}`}>
                      <div
                        className={cx("w-full rounded-t-md transition-all duration-300 group-hover:brightness-110", amount > 0 ? "bg-gradient-to-t from-menthe-300 to-menthe-600" : "bg-beige-100")}
                        style={{ height: `${amount > 0 ? Math.max(6, Math.round((amount / maxDay) * 100)) : 3}%` }}
                      />
                      {(i + 1) % 5 === 1 ? <span className="mt-1 font-mono text-[10px] text-ink-faint">{i + 1}</span> : <span className="mt-1 h-[15px]" />}
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <div className="grid grid-cols-1 gap-4 @3xl:grid-cols-2">
              <Panel title="Meilleurs clients du mois">
                {report.topCustomers.length === 0 ? (
                  <p className="mt-3 text-sm text-ink-soft">Aucun paiement ce mois-ci.</p>
                ) : (
                  <ol className="mt-4 flex flex-col gap-2">
                    {report.topCustomers.map((c, i) => (
                      <li key={c.customerId} className="flex items-center gap-3 rounded-lg bg-surface-2 px-3 py-2.5 text-sm">
                        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-azur-100 font-bold text-azur-700">{i + 1}</span>
                        <span className="min-w-0 flex-1 truncate font-semibold text-ink">{c.name}</span>
                        <span className="font-bold tabular text-ink">{money(c.amount)}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </Panel>
              <Panel title="Par moyen de paiement">
                {report.byMethod.length === 0 ? (
                  <p className="mt-3 text-sm text-ink-soft">Aucun paiement ce mois-ci.</p>
                ) : (
                  <ul className="mt-4 flex flex-col gap-2">
                    {report.byMethod.map((m) => (
                      <li key={m.method} className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-2 px-3 py-2.5 text-sm">
                        <Badge tone={PAYMENT_METHOD_META[m.method]?.tone ?? "neutral"}>{PAYMENT_METHOD_META[m.method]?.label ?? m.method}</Badge>
                        <span className="ml-auto font-bold tabular text-ink">{money(m.amount)}</span>
                        <span className="w-10 text-right font-mono text-xs text-ink-faint">×{m.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>

            <Panel title="Autres chiffres">
              <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-sm @xl:grid-cols-2">
                {[
                  ["Encaissé le mois précédent", money(report.previousCollected)],
                  ["Nouveaux clients", String(report.newCustomers)],
                  ["Reste à encaisser aujourd'hui (toutes commandes)", money(report.outstandingToday)],
                  ["Nombre de paiements", String(report.paymentsCount)],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-baseline justify-between gap-3 border-b border-anthracite-100 py-1.5">
                    <dt className="text-ink-soft">{label}</dt>
                    <dd className="font-bold tabular text-ink">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 text-xs text-ink-faint">
                Calculé sur cet appareil à partir des données synchronisées. L&apos;export contient aussi le détail de chaque paiement du mois.
              </p>
            </Panel>
          </>
        )}
      </main>
    </div>
  );
}
