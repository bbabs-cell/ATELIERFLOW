"use client";

import { usePlanGate } from "@/features/subscriptions/PlanGate";
import { useCallback, useEffect, useState } from "react";
import { BellRing, CalendarPlus, CheckCheck, MessageCircle, Package, Pencil } from "lucide-react";
import { Badge, Button, Calendar, Dialog, StateView } from "@/ui";
import { cx } from "@/lib/cx";
import type { Customer } from "@/domain/clients/customer";
import {
  appointmentDayISO,
  appointmentTimeLabel,
  isAppointmentEditable,
  type AppointmentStatus,
} from "@/domain/appointments/appointments";
import {
  defaultMessageKind,
  relativeDayLabel,
  reminderDue,
  type AppointmentMessageKind,
} from "@/domain/appointments/messages";
import type { AppointmentListItem } from "@/application/appointments/appointmentService";
import { getClientsFacade } from "@/features/clients/facade";
import { getOrdersFacade } from "@/features/orders/facade";
import { useAtelierIdentity } from "@/features/orders/useAtelierIdentity";
import { getAppointmentsFacade } from "./facade";
import { APPOINTMENT_STATUS_ACTIONS, APPOINTMENT_STATUS_META, APPOINTMENT_TYPE_META } from "./constants";
import {
  AppointmentForm,
  fromLocalInput,
  toLocalInput,
  type AppointmentFormValues,
  type OrderOption,
} from "./AppointmentForm";
import { MessageComposer } from "./MessageComposer";
import { AlertsInvite } from "@/features/notifications/AlertsInvite";
import { useDataChanged } from "@/features/sync/useDataChanged";

function todayISO(): string {
  return appointmentDayISO(new Date().toISOString());
}

function sentLabel(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

type FormState = { mode: "create" } | { mode: "edit"; item: AppointmentListItem };
type Flash = { text: string; item: AppointmentListItem; kind: AppointmentMessageKind } | null;

export function AppointmentsView(): React.ReactElement {
  const [items, setItems] = useState<AppointmentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState(todayISO);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<OrderOption[]>([]);
  const [form, setForm] = useState<FormState | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string> | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const plan = usePlanGate();
  const [composer, setComposer] = useState<{ item: AppointmentListItem; kind: AppointmentMessageKind } | null>(null);
  const [flash, setFlash] = useState<Flash>(null);
  const { identity } = useAtelierIdentity();

  const load = useCallback(async () => {
    setError(null);
    try {
      setItems(await getAppointmentsFacade().appointments.listAppointments());
    } catch {
      setError("Impossible de charger les rendez-vous.");
    } finally {
      setLoading(false);
    }
  }, []);
  useDataChanged(load);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function loadChoices() {
    const [customerList, orderRows] = await Promise.all([
      getClientsFacade().clients.listCustomers({ search: "", includeArchive: false }),
      getOrdersFacade().orders.listOrders({}),
    ]);
    setCustomers(customerList);
    setOrders(
      orderRows
        .filter((row) => row.order.status !== "CANCELLED")
        .map((row) => ({
          id: row.order.id,
          customerId: row.order.customer_id,
          label: [row.order.reference, row.items[0]?.description].filter(Boolean).join(" — "),
        })),
    );
  }

  async function openForm(state: FormState) {
    setFormErrors(null);
    setActionError(null);
    try {
      await loadChoices();
    } catch {
      // listes vides : le formulaire signalera le client manquant
    }
    setForm(state);
  }

  async function submit(values: AppointmentFormValues) {
    if (!form) return;
    setSaving(true);
    setFormErrors(null);
    const input = {
      customerId: values.customerId,
      orderId: values.orderId || null,
      type: values.type,
      startsAt: fromLocalInput(values.startsAt),
      endsAt: values.endsAt ? fromLocalInput(values.endsAt) : null,
      note: values.note || null,
    };
    try {
      const service = getAppointmentsFacade().appointments;
      if (form.mode === "create") {
        const result = await service.createAppointment(input);
        if (!result.ok) {
          setFormErrors(result.errors as Record<string, string>);
          return;
        }
        setForm(null);
        await load();
        setSelectedDay(appointmentDayISO(result.appointment.starts_at));
        const item = await service.getAppointment(result.appointment.id);
        if (item) setFlash({ text: "Rendez-vous planifié.", item, kind: "CONFIRMATION" });
      } else {
        const result = await service.updateAppointment(form.item.appointment.id, input);
        if (!result.ok) {
          setFormErrors(result.errors as Record<string, string>);
          return;
        }
        setForm(null);
        await load();
        setSelectedDay(appointmentDayISO(result.appointment.starts_at));
        const item = await service.getAppointment(result.appointment.id);
        if (item && result.rescheduled) setFlash({ text: "Horaire modifié.", item, kind: "RESCHEDULED" });
        else setFlash(null);
      }
    } finally {
      setSaving(false);
    }
  }

  async function runTransition(item: AppointmentListItem, to: AppointmentStatus) {
    setBusyId(item.appointment.id);
    setActionError(null);
    try {
      const result = await getAppointmentsFacade().appointments.transitionAppointment(item.appointment.id, to);
      if (!result.ok) {
        setActionError(result.reason);
        return;
      }
      await load();
      setFlash(to === "CANCELLED" ? { text: "Rendez-vous annulé.", item: { ...item, appointment: result.appointment }, kind: "CANCELLED" } : null);
    } finally {
      setBusyId(null);
    }
  }

  async function onMessageOpened(kind: AppointmentMessageKind) {
    const target = composer?.item;
    setComposer(null);
    setFlash(null);
    if (target && kind === "REMINDER") {
      await getAppointmentsFacade().appointments.markReminderSent(target.appointment.id);
      await load();
    }
  }

  const now = new Date().toISOString();
  const due = items
    .filter((item) => reminderDue(item.appointment, now))
    .sort((a, b) => a.appointment.starts_at.localeCompare(b.appointment.starts_at));
  const dayItems = items
    .filter((item) => appointmentDayISO(item.appointment.starts_at) === selectedDay)
    .sort((a, b) => a.appointment.starts_at.localeCompare(b.appointment.starts_at));

  const events = items.map((item) => ({
    id: item.appointment.id,
    date: appointmentDayISO(item.appointment.starts_at),
    label: item.customer?.full_name ?? "Client",
    tone: ({ SCHEDULED: "primary", CONFIRMED: "accent", COMPLETED: "success", CANCELLED: "danger", NO_SHOW: "danger" } as const)[
      item.appointment.status
    ],
  }));

  const editInitial = (item: AppointmentListItem): AppointmentFormValues => ({
    customerId: item.appointment.customer_id,
    orderId: item.appointment.order_id ?? "",
    type: item.appointment.type,
    startsAt: toLocalInput(item.appointment.starts_at),
    endsAt: toLocalInput(item.appointment.ends_at),
    note: item.appointment.note ?? "",
  });

  return (
    <div className="@container mx-auto w-full max-w-6xl px-4 py-6 sm:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title text-4xl text-ink sm:text-5xl">Rendez-vous</h1>
          <p className="mt-1 text-sm text-ink-soft">Essayages, mesures, retraits et livraisons — et les rappels WhatsApp aux clients.</p>
        </div>
        <Button onClick={() => void openForm({ mode: "create" })}>
          <CalendarPlus className="size-4" aria-hidden="true" />
          Nouveau rendez-vous
        </Button>
      </header>

      {flash ? (
        <div role="status" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-azur-300 bg-azur-50 px-4 py-3 animate-fade-up">
          <p className="text-sm font-semibold text-azur-600">
            {flash.text} Prévenir {flash.item.customer?.full_name ?? "le client"} ?
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setFlash(null)}>
              Plus tard
            </Button>
            <button
              type="button"
              onClick={() => plan.guardFeature("whatsapp", () => setComposer({ item: flash.item, kind: flash.kind }))}
              className="inline-flex h-9 pointer-coarse:h-11 items-center gap-1.5 rounded-full bg-azur-600 px-4 text-sm font-semibold text-white shadow-soft transition-all hover:-translate-y-0.5"
            >
              <MessageCircle className="size-4" aria-hidden="true" />
              Message WhatsApp
            </button>
          </div>
        </div>
      ) : null}

      <AlertsInvite className="mt-6" />

      <main className="mt-6 flex flex-col gap-6">
        {error ? (
          <StateView
            variant="error"
            title="Impossible de charger les rendez-vous"
            description={error}
            action={<Button onClick={() => load().catch(() => undefined)}>Réessayer</Button>}
          />
        ) : loading ? (
          <StateView variant="loading" title="Chargement des rendez-vous…" />
        ) : (
          <>
            <section aria-labelledby="reminders-title" className="gradient-border @container relative overflow-hidden rounded-2xl border border-outline bg-surface p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="reminders-title" className="flex items-center gap-2 font-display text-xl text-ink">
                  <span className={cx("grid size-9 place-items-center rounded-full text-white shadow-soft", due.length > 0 ? "bg-azur-gradient animate-pulse-ring" : "bg-azur-500")}>
                    {due.length > 0 ? <BellRing className="size-4" aria-hidden="true" /> : <CheckCheck className="size-4" aria-hidden="true" />}
                  </span>
                  Rappels à envoyer
                  <span key={due.length} className="grid min-w-7 place-items-center rounded-full bg-azur-100 px-2 text-sm font-bold text-azur-700 animate-pop">
                    {due.length}
                  </span>
                </h2>
                <p className="text-xs text-ink-soft">Rendez-vous d&apos;aujourd&apos;hui et de demain sans rappel envoyé.</p>
              </div>
              {due.length === 0 ? (
                <p className="mt-3 text-sm text-ink-soft">Tout est à jour : aucun client à prévenir pour le moment.</p>
              ) : (
                <ul className="stagger mt-4 grid grid-cols-1 gap-3 @xl:grid-cols-2 @4xl:grid-cols-3">
                  {due.map((item) => {
                    const typeMeta = APPOINTMENT_TYPE_META[item.appointment.type];
                    return (
                      <li key={item.appointment.id} className="flex flex-col gap-2 rounded-xl border border-azur-200 bg-azur-50/70 p-3 animate-fade-up">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-bold text-ink">{item.customer?.full_name ?? "Client"}</p>
                            <p className="text-xs text-ink-soft first-letter:uppercase">
                              {relativeDayLabel(item.appointment.starts_at, now)} à {appointmentTimeLabel(item.appointment.starts_at)}
                            </p>
                          </div>
                          <Badge tone={typeMeta.tone}>{typeMeta.label}</Badge>
                        </div>
                        <button
                          type="button"
                          onClick={() => plan.guardFeature("whatsapp", () => setComposer({ item, kind: "REMINDER" }))}
                          className="inline-flex h-9 pointer-coarse:h-11 items-center justify-center gap-1.5 rounded-full bg-azur-600 px-4 text-sm font-semibold text-white shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-lift"
                        >
                          <MessageCircle className="size-4" aria-hidden="true" />
                          Préparer le rappel
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <div className="grid grid-cols-1 gap-6 @4xl:grid-cols-[minmax(0,340px)_1fr]">
              <aside className="rounded-xl border border-outline bg-surface p-4">
                <Calendar events={events} onSelectDate={(day) => setSelectedDay(day)} />
              </aside>

              <section className="rounded-xl border border-outline bg-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-display text-lg text-ink capitalize">
                    {new Date(`${selectedDay}T00:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
                  </h2>
                  {actionError ? (
                    <p className="text-sm text-danger" role="alert">
                      {actionError}
                    </p>
                  ) : null}
                </div>

                {dayItems.length === 0 ? (
                  <StateView variant="empty" title="Aucun rendez-vous ce jour" description="Sélectionnez une autre date ou planifiez un rendez-vous." />
                ) : (
                  <ul className="mt-3 flex flex-col gap-2">
                    {dayItems.map((item) => {
                      const { appointment } = item;
                      const meta = APPOINTMENT_STATUS_META[appointment.status];
                      const typeMeta = APPOINTMENT_TYPE_META[appointment.type];
                      const actions = APPOINTMENT_STATUS_ACTIONS[appointment.status];
                      const busy = busyId === appointment.id;
                      const editable = isAppointmentEditable(appointment.status);
                      return (
                        <li key={appointment.id} className="rounded-xl border border-outline bg-surface-2/80 p-3 transition-shadow hover:shadow-soft">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="flex min-w-0 items-start gap-2">
                              <span className="w-24 shrink-0 font-mono text-sm font-semibold text-ink">
                                {appointmentTimeLabel(appointment.starts_at)}
                                {appointment.ends_at ? `–${appointmentTimeLabel(appointment.ends_at)}` : ""}
                              </span>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-ink">{item.customer?.full_name ?? "Client supprimé"}</p>
                                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                  <Badge tone={typeMeta.tone}>{typeMeta.label}</Badge>
                                  <Badge tone={meta.tone}>{meta.label}</Badge>
                                  {item.order ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-chocolat-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-chocolat-700">
                                      <Package className="size-3" aria-hidden="true" />
                                      {item.order.reference}
                                    </span>
                                  ) : null}
                                  {appointment.reminder_sent_at ? (
                                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-azur-600">
                                      <CheckCheck className="size-3.5" aria-hidden="true" />
                                      Rappel envoyé le {sentLabel(appointment.reminder_sent_at)}
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              <button
                                type="button"
                                onClick={() => plan.guardFeature("whatsapp", () => setComposer({ item, kind: defaultMessageKind(appointment) }))}
                                aria-label={`Message WhatsApp à ${item.customer?.full_name ?? "client"}`}
                                className="inline-flex h-9 pointer-coarse:h-11 items-center gap-1.5 rounded-full bg-azur-600 px-3 text-sm font-semibold text-white shadow-soft transition-all hover:-translate-y-0.5"
                              >
                                <MessageCircle className="size-4" aria-hidden="true" />
                                WhatsApp
                              </button>
                              {editable ? (
                                <Button type="button" variant="ghost" size="sm" onClick={() => void openForm({ mode: "edit", item })}>
                                  <Pencil className="size-4" aria-hidden="true" />
                                  Modifier
                                </Button>
                              ) : null}
                              {actions.map((a) => (
                                <Button
                                  key={a.to}
                                  type="button"
                                  variant={a.to === "CANCELLED" ? "ghost" : "outline"}
                                  size="sm"
                                  onClick={() => void runTransition(item, a.to)}
                                  loading={busy}
                                  disabled={busyId !== null && !busy}
                                >
                                  {a.label}
                                </Button>
                              ))}
                            </div>
                          </div>
                          {appointment.note ? <p className="mt-2 text-sm text-ink-soft">{appointment.note}</p> : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>
          </>
        )}
      </main>

      <Dialog open={form !== null} onClose={() => setForm(null)} title={form?.mode === "edit" ? "Modifier" : "Planifier"} size="lg">
        {form ? (
          <AppointmentForm
            key={form.mode === "edit" ? form.item.appointment.id : "new"}
            customers={customers}
            orders={orders}
            mode={form.mode}
            initial={form.mode === "edit" ? editInitial(form.item) : undefined}
            errors={formErrors}
            busy={saving}
            onSubmit={submit}
            onCancel={() => setForm(null)}
          />
        ) : null}
      </Dialog>

      {composer ? (
        <MessageComposer
          item={composer.item}
          initialKind={composer.kind}
          atelier={identity}
          onClose={() => setComposer(null)}
          onOpened={(kind) => void onMessageOpened(kind)}
        />
      ) : null}
      {plan.dialog}
    </div>
  );
}
