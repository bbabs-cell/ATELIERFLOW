"use client";

import { useState } from "react";
import { CalendarDays, CalendarClock } from "lucide-react";
import { Button, Field, Input, Select, Textarea } from "@/ui";
import { APPOINTMENT_TYPES } from "@/domain/appointments/appointments";
import type { Customer } from "@/domain/clients/customer";
import { APPOINTMENT_TYPE_LABELS } from "./constants";

export interface AppointmentFormValues {
  customerId: string;
  orderId: string;
  type: string;
  /** Valeurs des champs datetime-local (heure de l'appareil). */
  startsAt: string;
  endsAt: string;
  note: string;
}

export interface OrderOption {
  id: string;
  customerId: string;
  label: string;
}

export interface AppointmentFormProps {
  customers: Customer[];
  orders: OrderOption[];
  initial?: AppointmentFormValues;
  mode?: "create" | "edit";
  busy?: boolean;
  errors?: Record<string, string> | null;
  onSubmit: (values: AppointmentFormValues) => Promise<void>;
  onCancel: () => void;
}

/** ISO → valeur d'un champ datetime-local, dans le fuseau de l'appareil. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Valeur datetime-local → ISO UTC (évite toute ambiguïté de fuseau côté serveur). */
export function fromLocalInput(value: string): string {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toISOString();
}

const EMPTY: AppointmentFormValues = { customerId: "", orderId: "", type: "MEASUREMENTS", startsAt: "", endsAt: "", note: "" };

export function AppointmentForm({ customers, orders, initial, mode = "create", busy, errors, onSubmit, onCancel }: AppointmentFormProps) {
  const [values, setValues] = useState<AppointmentFormValues>(initial ?? EMPTY);
  const set = <K extends keyof AppointmentFormValues>(key: K, value: AppointmentFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));
  const customerOrders = orders.filter((o) => o.customerId === values.customerId);
  const editing = mode === "edit";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="flex size-9 items-center justify-center rounded-full bg-azur-gradient text-white shadow-soft">
          {editing ? <CalendarClock className="size-4" aria-hidden="true" /> : <CalendarDays className="size-4" aria-hidden="true" />}
        </span>
        <h2 className="font-display text-2xl text-ink">{editing ? "Modifier le rendez-vous" : "Nouveau rendez-vous"}</h2>
      </div>

      {errors?.generic ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          {errors.generic}
        </p>
      ) : null}

      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          void onSubmit(values);
        }}
        noValidate
      >
        <div className="grid gap-4 min-[480px]:grid-cols-2">
          <Field label="Client" required htmlFor="appointment-customer" error={errors?.customerId}>
            <Select
              id="appointment-customer"
              value={values.customerId}
              onChange={(e) => setValues((v) => ({ ...v, customerId: e.target.value, orderId: "" }))}
              invalid={Boolean(errors?.customerId)}
            >
              <option value="">Choisir un client…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Commande liée (optionnel)" htmlFor="appointment-order" error={errors?.orderId}>
            <Select
              id="appointment-order"
              value={values.orderId}
              onChange={(e) => set("orderId", e.target.value)}
              disabled={!values.customerId}
              invalid={Boolean(errors?.orderId)}
            >
              <option value="">{values.customerId && customerOrders.length === 0 ? "Aucune commande pour ce client" : "Aucune"}</option>
              {customerOrders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 min-[480px]:grid-cols-3">
          <Field label="Type de rendez-vous" htmlFor="appointment-type">
            <Select id="appointment-type" value={values.type} onChange={(e) => set("type", e.target.value)}>
              {APPOINTMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {APPOINTMENT_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Début" required htmlFor="appointment-starts" error={errors?.startsAt}>
            <Input
              id="appointment-starts"
              type="datetime-local"
              value={values.startsAt}
              onChange={(e) => set("startsAt", e.target.value)}
              invalid={Boolean(errors?.startsAt)}
            />
          </Field>
          <Field label="Fin (optionnel)" htmlFor="appointment-ends" error={errors?.endsAt}>
            <Input
              id="appointment-ends"
              type="datetime-local"
              value={values.endsAt}
              onChange={(e) => set("endsAt", e.target.value)}
              invalid={Boolean(errors?.endsAt)}
            />
          </Field>
        </div>

        <Field label="Note" htmlFor="appointment-note">
          <Textarea
            id="appointment-note"
            rows={3}
            value={values.note}
            onChange={(e) => set("note", e.target.value)}
            placeholder="Ex : apporter le tissu pour l'essayage."
          />
        </Field>

        {editing && initial && values.startsAt !== initial.startsAt ? (
          <p className="rounded-lg bg-azur-100 px-3 py-2 text-xs text-chocolat-700">
            Nouvel horaire : vous pourrez prévenir le client par WhatsApp juste après l&apos;enregistrement.
          </p>
        ) : null}

        <div className="flex justify-end gap-2 border-t border-anthracite-100 pt-4">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            Annuler
          </Button>
          <Button type="submit" loading={busy}>
            {editing ? "Enregistrer" : "Planifier"}
          </Button>
        </div>
      </form>
    </div>
  );
}
