"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Banknote, BellRing, Check, Copy, HandCoins, MessageCircle, Volume2 } from "lucide-react";
import { Button, Dialog, Field, Input, StateView, Textarea } from "@/ui";
import { cx } from "@/lib/cx";
import { peekActiveSession } from "@/application/auth/session";
import { buildDebtMessage, customerDebts, totalDebt, type CustomerDebt } from "@/domain/orders/debts";
import type { OrderItemRecord } from "@/domain/orders/order";
import { formatFcfa } from "@/domain/money";
import { countryCodeOf, toWhatsappNumber, WHATSAPP_MESSAGE_MAX } from "@/domain/messaging/whatsapp";
import { createClickToChatGateway } from "@/application/messaging/whatsappGateway";
import { getDashboardFacade } from "@/features/dashboard/facade";
import { getOrdersFacade } from "@/features/orders/facade";
import { useAtelierIdentity } from "@/features/orders/useAtelierIdentity";
import { STAGE_META } from "@/features/orders/stageMeta";
import { useDataChanged } from "@/features/sync/useDataChanged";
import { canSpeak, speak } from "@/infrastructure/speech/speak";
import { readReminderLog, recordReminder } from "@/infrastructure/debts/reminderLog";

/**
 * Soldes à encaisser : les clients qui doivent encore de l'argent, avec la
 * relance WhatsApp prête en un toucher.
 *
 * Pour qui : le propriétaire et l'équipe, souvent au téléphone, parfois sans
 * savoir lire — nom en grand, montant en grand, image de l'étape de l'habit,
 * gros boutons (Relancer, Écouter, Encaisser). Calcul sur l'appareil
 * (domain/orders/debts.ts) : aucune table, aucune migration.
 */

const gateway = createClickToChatGateway((url) => window.open(url, "_blank", "noopener,noreferrer"));

type Filter = "NOW" | "ALL";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function sinceWords(iso: string, now: Date): string {
  const days = Math.round((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.parse(iso.slice(0, 10))) / 86_400_000);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return "hier";
  return `il y a ${days} jours`;
}

function spokenAmount(amount: number): string {
  return formatFcfa(amount).replace(/F\s?CFA/, "francs CFA");
}

export function DebtsView(): React.ReactElement {
  const tenantId = peekActiveSession()?.tenantId ?? "local";
  const { identity } = useAtelierIdentity();
  const [debts, setDebts] = useState<CustomerDebt[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Sans choix : « Maintenant » s'il y a des habits prêts ou remis à encaisser, sinon « Tous ».
  const [chosen, setFilter] = useState<Filter | null>(null);
  const [reminders, setReminders] = useState<Record<string, string>>(() => readReminderLog(tenantId));
  const [composing, setComposing] = useState<CustomerDebt | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const speech = canSpeak();

  const load = useCallback(async () => {
    setError(null);
    try {
      const [orders, sources] = await Promise.all([
        getOrdersFacade().orders.listOrders({}),
        getDashboardFacade().dashboard.getAssistantSources(),
      ]);
      if (!sources.permissions.includes("payments.read") || !sources.permissions.includes("orders.read")) {
        setForbidden(true);
        return;
      }
      const items = new Map<string, OrderItemRecord[]>(orders.map((o) => [o.order.id, o.items]));
      setDebts(customerDebts({ orders: orders.map((o) => o.order), payments: sources.payments, customers: sources.customers, items }));
    } catch {
      setError("Impossible de lire les commandes de l'atelier sur cet appareil.");
    }
  }, []);
  useDataChanged(load);
  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const now = new Date();
  const dueNow = useMemo(() => (debts ?? []).filter((d) => d.dueNow), [debts]);
  const filter: Filter = chosen ?? (dueNow.length > 0 ? "NOW" : "ALL");
  const shown = filter === "NOW" ? dueNow : (debts ?? []);

  if (forbidden) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:py-10">
        <StateView variant="empty" title="Soldes non autorisés" description="Votre rôle ne permet pas de voir les paiements." />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:py-10">
      <header>
        <h1 className="page-title text-4xl text-ink sm:text-5xl">Soldes</h1>
        <p className="mt-1 text-sm text-ink-soft">Les clients qui doivent encore de l&apos;argent. Relancez-les sur WhatsApp en un toucher.</p>
      </header>

      {error ? (
        <div className="mt-6">
          <StateView variant="error" title="Soldes indisponibles" description={error} action={<Button variant="outline" onClick={() => void load()}>Réessayer</Button>} />
        </div>
      ) : debts === null ? (
        <div className="mt-6">
          <StateView variant="loading" title="Calcul des soldes…" />
        </div>
      ) : (
        <>
          <section className="dot-grid relative mt-6 overflow-hidden rounded-2xl bg-chocolat-900 p-5 text-ivoire-50 shadow-lift">
            <div aria-hidden="true" className="ambient-static-dark pointer-events-none absolute inset-0" />
            <div className="relative flex items-center gap-3 sm:gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-menthe-600 text-white sm:size-14">
                <HandCoins className="size-6 sm:size-7" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-champagne-300">À encaisser</p>
                {/* Le montant a sa ligne à lui : rien ne le recouvre, même « 1 250 000 F CFA » à 320 px. */}
                <p className="font-display text-[1.6rem] font-extrabold leading-tight text-menthe-300 tabular [overflow-wrap:anywhere] xs:text-3xl sm:text-4xl">
                  {formatFcfa(totalDebt(debts))}
                </p>
              </div>
            </div>
            <div className="relative mt-3 flex items-center gap-3">
              <p className="min-w-0 flex-1 text-sm text-chocolat-200">
                {debts.length} client{debts.length > 1 ? "s" : ""}
                {dueNow.length > 0 ? ` · dont ${dueNow.length} à encaisser maintenant` : ""}
              </p>
              {speech ? (
                <button
                  type="button"
                  onClick={() =>
                    speak(
                      `Il reste ${spokenAmount(totalDebt(debts))} à encaisser, chez ${debts.length} client${debts.length > 1 ? "s" : ""}.${dueNow.length > 0 ? ` ${dueNow.length} à encaisser maintenant.` : ""}`,
                    )
                  }
                  aria-label="Écouter le total"
                  className="grid size-12 shrink-0 place-items-center rounded-xl bg-white/10 text-ivoire-50 transition active:scale-95"
                >
                  <Volume2 className="size-5" aria-hidden="true" />
                </button>
              ) : null}
            </div>
          </section>

          <div role="radiogroup" aria-label="Quels soldes" className="mt-5 grid grid-cols-2 gap-2">
            {(
              [
                ["NOW", "Maintenant", `Habit prêt ou remis (${dueNow.length})`],
                ["ALL", "Tous", `Tous les clients (${debts.length})`],
              ] as const
            ).map(([value, label, hint]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={filter === value}
                onClick={() => setFilter(value)}
                className={cx(
                  "flex min-w-0 flex-col items-start rounded-2xl border-2 px-4 py-2.5 text-left transition active:scale-95",
                  filter === value ? "border-chocolat-900 bg-chocolat-900 text-white" : "border-outline bg-surface text-ink",
                )}
              >
                <span className="text-base font-bold">{label}</span>
                <span className={cx("max-w-full truncate text-xs", filter === value ? "text-chocolat-200" : "text-ink-soft")}>{hint}</span>
              </button>
            ))}
          </div>

          {notice ? (
            <p role="status" className="mt-4 rounded-lg border-2 border-menthe-300 bg-menthe-50 px-3 py-2 text-sm font-semibold text-menthe-600">
              {notice}
            </p>
          ) : null}

          {shown.length === 0 ? (
            <div className="mt-5">
              <StateView
                variant="empty"
                title={filter === "NOW" ? "Rien à encaisser maintenant" : "Aucun solde en attente"}
                description={
                  filter === "NOW"
                    ? "Aucun habit prêt ou remis n'attend de paiement. Touchez « Tous » pour voir les acomptes en cours."
                    : "Toutes les commandes sont payées. Bravo !"
                }
              />
            </div>
          ) : (
            <ul className="stagger mt-5 flex flex-col gap-3">
              {shown.map((debt) => {
                const reminded = reminders[debt.customerId];
                return (
                  <li key={debt.customerId} className="rounded-2xl border border-outline bg-surface p-4 shadow-soft">
                    <div className="flex items-start gap-3">
                      <span className="grid size-12 shrink-0 place-items-center rounded-full bg-ocean-gradient text-sm font-bold text-white">{initials(debt.customerName)}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-lg font-bold text-ink">{debt.customerName}</p>
                        <p className="truncate text-xs text-ink-faint">{debt.whatsapp ?? debt.phone ?? "Pas de numéro"}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Reste</p>
                        <p className="font-display text-xl font-extrabold text-ink tabular">{formatFcfa(debt.totalDue)}</p>
                      </div>
                    </div>

                    <ul className="mt-3 flex flex-col gap-1.5">
                      {debt.orders.slice(0, 3).map(({ order, stage, remaining, article }) => {
                        const meta = STAGE_META[stage];
                        return (
                          <li key={order.id} className="flex min-w-0 items-center gap-2 rounded-xl bg-surface-2 px-2.5 py-1.5 text-sm">
                            <span className={cx("grid size-7 shrink-0 place-items-center rounded-full", meta.solid)}>
                              <meta.icon className="size-4" aria-hidden="true" />
                            </span>
                            {/* Le mot de l'étape reste entier ; seul le nom de l'habit peut finir en « … ». */}
                            <span className="shrink-0 font-semibold text-ink">{meta.label}</span>
                            {article ? <span className="min-w-0 truncate text-ink-soft">· {article}</span> : null}
                            <span className="ml-auto shrink-0 pl-1 font-semibold text-ink tabular">{formatFcfa(remaining)}</span>
                          </li>
                        );
                      })}
                      {debt.orders.length > 3 ? <li className="px-2.5 text-xs text-ink-faint">+ {debt.orders.length - 3} autre(s) commande(s)</li> : null}
                    </ul>

                    {reminded ? (
                      <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-azur-700">
                        <BellRing className="size-3.5" aria-hidden="true" /> Relancé {sinceWords(reminded, now)} (sur ce téléphone)
                      </p>
                    ) : null}

                    {/* Actions de carte en secondaire : la couleur pleine reste aux boutons des fenêtres.
                        Téléphone : « Relancer » seul sur sa ligne, pour que le mot ne soit jamais coupé. */}
                    <div className="mt-3 flex flex-wrap items-stretch gap-2 sm:flex-nowrap">
                      <button
                        type="button"
                        onClick={() => setComposing(debt)}
                        className="flex h-12 w-full min-w-0 items-center justify-center gap-2 rounded-xl border-2 border-menthe-300 bg-menthe-50 px-3 text-base font-bold text-menthe-600 transition active:scale-95 sm:w-auto sm:flex-1"
                      >
                        <MessageCircle className="size-5 shrink-0" aria-hidden="true" />
                        <span className="truncate">Relancer</span>
                      </button>
                      <Link
                        href={`/commandes?commande=${debt.orders[0].order.id}`}
                        className="flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border-2 border-outline bg-surface px-3 text-base font-bold text-ink transition active:scale-95 sm:flex-none sm:text-sm"
                      >
                        <Banknote className="size-5" aria-hidden="true" />
                        Encaisser
                      </Link>
                      {speech ? (
                        <button
                          type="button"
                          onClick={() =>
                            speak(
                              `${debt.customerName} doit encore ${spokenAmount(debt.totalDue)}. ${debt.orders
                                .map((o) => `${STAGE_META[o.stage].label}${o.article ? `, ${o.article}` : ""}`)
                                .join(". ")}.${reminded ? ` Relancé ${sinceWords(reminded, now)}.` : ""}`,
                            )
                          }
                          aria-label={`Écouter : ${debt.customerName}`}
                          className="grid size-12 shrink-0 place-items-center rounded-xl border-2 border-outline bg-surface text-ink-soft transition active:scale-95"
                        >
                          <Volume2 className="size-5" aria-hidden="true" />
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {composing ? (
        <DebtComposer
          debt={composing}
          atelierName={identity?.name ?? "L'atelier"}
          atelierPhone={identity?.phone ?? null}
          onClose={() => setComposing(null)}
          onOpened={() => {
            setReminders(recordReminder(tenantId, composing.customerId, new Date().toISOString()));
            setNotice(`WhatsApp est ouvert avec le message pour ${composing.customerName} : appuyez sur Envoyer dans WhatsApp.`);
            setComposing(null);
          }}
        />
      ) : null}
    </div>
  );
}

function DebtComposer({
  debt,
  atelierName,
  atelierPhone,
  onClose,
  onOpened,
}: {
  debt: CustomerDebt;
  atelierName: string;
  atelierPhone: string | null;
  onClose: () => void;
  onOpened: () => void;
}) {
  const [text, setText] = useState(() => buildDebtMessage({ debt, atelierName, formatAmount: formatFcfa }));
  const [phone, setPhone] = useState(debt.whatsapp ?? debt.phone ?? "");
  const [copied, setCopied] = useState(false);
  const number = useMemo(() => toWhatsappNumber(phone, countryCodeOf(atelierPhone)), [phone, atelierPhone]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Relancer ${debt.customerName}`}
      size="md"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={() => void copy()}>
            {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
            {copied ? "Copié" : "Copier"}
          </Button>
          <button
            type="button"
            disabled={text.trim() === ""}
            onClick={() => {
              void gateway.dispatch({ to: number, text, context: { entity: "customers", id: debt.customerId, kind: "BALANCE_REMINDER" } }).then(onOpened);
            }}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-menthe-600 px-5 text-base font-bold text-white shadow-soft transition active:scale-95 disabled:pointer-events-none disabled:opacity-50"
          >
            <MessageCircle className="size-5" aria-hidden="true" />
            Envoyer sur WhatsApp
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3 py-2.5">
          <span className="text-sm text-ink-soft">Reste à payer</span>
          <span className="font-display text-xl font-extrabold text-ink tabular">{formatFcfa(debt.totalDue)}</span>
        </div>
        <Field label="Numéro WhatsApp du client" htmlFor="debt-phone">
          <Input id="debt-phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+221 77 000 00 00" />
        </Field>
        <p className={cx("-mt-2 text-xs", number ? "text-azur-600" : "text-ink-soft")}>
          {number ? `Conversation directe avec +${number}.` : "Numéro absent ou non reconnu : WhatsApp vous laissera choisir le contact."}
        </p>
        <Field label="Message (modifiable)" htmlFor="debt-text">
          <Textarea id="debt-text" rows={8} value={text} maxLength={WHATSAPP_MESSAGE_MAX} onChange={(e) => setText(e.target.value)} />
        </Field>
        {canSpeak() ? (
          <button type="button" onClick={() => speak(text)} className="inline-flex items-center gap-2 self-start text-sm font-semibold text-azur-700">
            <Volume2 className="size-4" aria-hidden="true" /> Écouter le message
          </button>
        ) : null}
      </div>
    </Dialog>
  );
}
