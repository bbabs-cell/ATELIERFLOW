"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { Button, Field, Input, Select, Textarea } from "@/ui";
import { APPOINTMENT_TYPES } from "@/domain/appointments/appointments";
import type { Customer } from "@/domain/clients/customer";
import { APPOINTMENT_TYPE_LABELS } from "./constants";

export interface AppointmentFormValues {
  customerId: string;
  type: string;
  startsAt: string;
  endsAt: string;
  note: string;
}

export interface AppointmentFormProps {
  customers: Customer[];
  busy?: boolean;
  errors?: Record<string, string> | null;
  onSubmit: (values: AppointmentFormValues) => Promise<void>;
  onCancel: () => void;
}

export function AppointmentForm({
  customers,
  busy,
  errors,
  onSubmit,
  onCancel,
}: AppointmentFormProps) {
  const [customerId, setCustomerId] = useState("");
  const [type, setType] = useState("MEASUREMENTS");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [note, setNote] = useState("");

  function submit() {
    void onSubmit({
      customerId,
      type,
      startsAt,
      endsAt,
      note,
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="flex size-9 items-center justify-center rounded-full bg-champagne-400 text-chocolat-950">
          <CalendarDays className="size-4" aria-hidden="true" />
        </span>
        <h2 className="font-display text-2xl text-ink">Nouveau rendez-vous</h2>
      </div>

      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        noValidate
      >
        <div className="grid gap-4 min-[480px]:grid-cols-2">
          <Field
            label="Client"
            required
            htmlFor="appointment-customer"
            error={errors?.customerId}
          >
            <Select
              id="appointment-customer"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
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
          <Field label="Type de rendez-vous" htmlFor="appointment-type">
            <Select
              id="appointment-type"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              {APPOINTMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {APPOINTMENT_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 min-[480px]:grid-cols-2">
          <Field
            label="Début"
            required
            htmlFor="appointment-starts"
            error={errors?.startsAt}
          >
            <Input
              id="appointment-starts"
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              invalid={Boolean(errors?.startsAt)}
            />
          </Field>
          <Field label="Fin (optionnel)" htmlFor="appointment-ends" error={errors?.endsAt}>
            <Input
              id="appointment-ends"
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              invalid={Boolean(errors?.endsAt)}
            />
          </Field>
        </div>

        <Field label="Note" htmlFor="appointment-note">
          <Textarea
            id="appointment-note"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ex : apporter le tissu pour l'essayage."
          />
        </Field>

        <div className="flex justify-end gap-2 border-t border-anthracite-100 pt-4">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            Annuler
          </Button>
          <Button type="submit" loading={busy}>
            Planifier
          </Button>
        </div>
      </form>
    </div>
  );
}