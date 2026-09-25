"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarPlus, MessageCircleMore } from "lucide-react";
import { Badge, Button, Calendar, Dialog, StateView } from "@/ui";
import type { Customer } from "@/domain/clients/customer";
import { appointmentDayISO, appointmentTimeLabel } from "@/domain/appointments/appointments";
import type { AppointmentStatus } from "@/domain/appointments/appointments";
import type { NotificationRecord } from "@/domain/appointments/notifications";
import type { AppointmentListItem } from "@/application/appointments/appointmentService";
import { getClientsFacade } from "@/features/clients/facade";
import { getAppointmentsFacade } from "./facade";
import {
  APPOINTMENT_STATUS_ACTIONS,
  APPOINTMENT_STATUS_META,
  APPOINTMENT_TYPE_META,
} from "./constants";
import { AppointmentForm, type AppointmentFormValues } from "./AppointmentForm";

export function AppointmentsView(): React.ReactElement {
  const [items, setItems] = useState<AppointmentListItem[]>([]);
  const [reminders, setReminders] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
  });
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string> | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const facade = getAppointmentsFacade();
      const [list, notifications] = await Promise.all([
        facade.appointments.listAppointments(),
        facade.notifications.listNotifications(),
      ]);
      setItems(list);
      setReminders(notifications);
    } catch {
      setError("Impossible de charger les rendez-vous.");
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

  async function openCreate() {
    setFormErrors(null);
    setFormOpen(true);
    if (customers.length === 0) {
      const list = await getClientsFacade().clients.listCustomers({
        search: "",
        includeArchive: false,
      });
      setCustomers(list);
    }
  }

  async function submit(values: AppointmentFormValues) {
    setSaving(true);
    setFormErrors(null);
    try {
      const result = await getAppointmentsFacade().appointments.createAppointment({
        customerId: values.customerId,
        type: values.type,
        startsAt: values.startsAt,
        endsAt: values.endsAt || null,
        note: values.note || null,
      });
      if (!result.ok) {
        setFormErrors(result.errors as Record<string, string>);
        return;
      }
      setFormOpen(false);
      await load();
      const day = appointmentDayISO(result.appointment.starts_at);
      setSelectedDay(day);
    } finally {
      setSaving(false);
    }
  }

  async function runTransition(id: string, to: AppointmentStatus) {
    setBusyId(id);
    setActionError(null);
    try {
      const result = await getAppointmentsFacade().appointments.transitionAppointment(id, to);
      if (!result.ok) {
        setActionError(result.reason);
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  const dayItems = items.filter(
    (item) => appointmentDayISO(item.appointment.starts_at) === selectedDay,
  );
  const reminderFor = (appointmentId: string) =>
    reminders.find(
      (n) =>
        n.channel === "WHATSAPP" &&
        (n.payload as { appointment_id?: string } | undefined)?.appointment_id === appointmentId,
    );

  const events = items.map((item) => ({
    id: item.appointment.id,
    date: appointmentDayISO(item.appointment.starts_at),
    label: item.customer?.full_name ?? "Client",
    tone: {
      SCHEDULED: "primary",
      CONFIRMED: "accent",
      COMPLETED: "success",
      CANCELLED: "danger",
      NO_SHOW: "danger",
    }[item.appointment.status] as "primary" | "accent" | "success" | "danger",
  }));

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-ink sm:text-4xl">Rendez-vous</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Planification de l&apos;atelier : essayages, mesures, retraits et livraisons.
          </p>
        </div>
        <Button onClick={() => void openCreate()}>
          <CalendarPlus className="size-4" aria-hidden="true" />
          Nouveau rendez-vous
        </Button>
      </header>

      <main className="mt-8">
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
          <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_1fr]">
            <aside className="rounded-xl border border-outline bg-surface p-4">
              <Calendar events={events} onSelectDate={(day) => setSelectedDay(day)} />
            </aside>

            <section className="rounded-xl border border-outline bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-lg text-ink capitalize">
                  {new Date(`${selectedDay}T00:00:00`).toLocaleDateString("fr-FR", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })}
                </h2>
                {actionError ? (
                  <p className="text-sm text-danger" role="alert">
                    {actionError}
                  </p>
                ) : null}
              </div>

              {dayItems.length === 0 ? (
                <StateView
                  variant="empty"
                  title="Aucun rendez-vous ce jour"
                  description="Sélectionnez une autre date ou planifiez un rendez-vous."
                />
              ) : (
                <ul className="mt-3 flex flex-col gap-2">
                  {dayItems.map((item) => {
                    const status = item.appointment.status;
                    const meta = APPOINTMENT_STATUS_META[status];
                    const typeMeta = APPOINTMENT_TYPE_META[item.appointment.type];
                    const reminder = reminderFor(item.appointment.id);
                    const actions = APPOINTMENT_STATUS_ACTIONS[status];
                    const busy = busyId === item.appointment.id;
                    return (
                      <li
                        key={item.appointment.id}
                        className="rounded-lg border border-outline bg-surface-2 p-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="w-14 font-mono text-sm font-semibold text-ink">
                              {appointmentTimeLabel(item.appointment.starts_at)}
                              {item.appointment.ends_at
                                ? `–${appointmentTimeLabel(item.appointment.ends_at)}`
                                : ""}
                            </span>
                            <div>
                              <p className="text-sm font-medium text-ink">
                                {item.customer?.full_name ?? "Client supprimé"}
                              </p>
                              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                                <Badge tone={typeMeta.tone}>{typeMeta.label}</Badge>
                                <Badge tone={meta.tone}>{meta.label}</Badge>
                                {reminder ? (
                                  <span className="flex items-center gap-1 text-xs text-ink-faint">
                                    <MessageCircleMore className="size-3.5" aria-hidden="true" />
                                    Rappel WhatsApp en attente
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {actions.map((a) => (
                              <Button
                                key={a.to}
                                type="button"
                                variant={a.to === "CANCELLED" ? "ghost" : "outline"}
                                size="sm"
                                onClick={() => void runTransition(item.appointment.id, a.to)}
                                loading={busy}
                                disabled={busyId !== null && !busy}
                              >
                                {a.label}
                              </Button>
                            ))}
                          </div>
                        </div>
                        {item.appointment.note ? (
                          <p className="mt-2 text-sm text-ink-soft">
                            {item.appointment.note}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        )}
      </main>

      <Dialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Nouveau rendez-vous"
        size="lg"
      >
        <AppointmentForm
          customers={customers}
          errors={formErrors}
          busy={saving}
          onSubmit={submit}
          onCancel={() => setFormOpen(false)}
        />
      </Dialog>
    </div>
  );
}
