"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Button, Field, Input, Textarea } from "@/ui";
import type { ContactErrors } from "@/domain/clients/customer";
import type { CustomerContactInput } from "@/domain/clients/customer";

export interface CustomerFormProps {
  title: string;
  initial?: Partial<CustomerContactInput>;
  errors?: ContactErrors | null;
  busy?: boolean;
  onSubmit: (values: CustomerContactInput) => Promise<void>;
  onCancel: () => void;
}

interface FormValues {
  full_name: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  notes: string;
}

export function CustomerForm({
  title,
  initial,
  errors,
  busy,
  onSubmit,
  onCancel,
}: CustomerFormProps) {
  const [values, setValues] = useState<FormValues>({
    full_name: initial?.full_name ?? "",
    phone: initial?.phone ?? "",
    whatsapp: initial?.whatsapp ?? "",
    email: initial?.email ?? "",
    address: initial?.address ?? "",
    notes: initial?.notes ?? "",
  });

  const set = <K extends keyof FormValues>(
    key: K,
    value: FormValues[K],
  ) => setValues((v) => ({ ...v, [key]: value }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="flex size-9 items-center justify-center rounded-full bg-champagne-400 text-chocolat-950">
          <UserPlus className="size-4" aria-hidden="true" />
        </span>
        <h2 className="font-display text-2xl text-ink">{title}</h2>
      </div>

      {errors?.generic ? (
        <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
          {errors.generic}
        </p>
      ) : null}

      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void onSubmit(values);
        }}
        noValidate
      >
        <Field label="Nom complet" required htmlFor="full_name" error={errors?.full_name}>
          <Input
            id="full_name"
            name="full_name"
            value={values.full_name}
            onChange={(e) => set("full_name", e.target.value)}
            placeholder="Ex : Awa Diop"
            invalid={Boolean(errors?.full_name)}
            autoComplete="name"
          />
        </Field>

        <div className="grid gap-4 min-[480px]:grid-cols-2">
          <Field label="Téléphone" htmlFor="phone" error={errors?.phone}>
            <Input
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              value={values.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="77 123 45 67"
              invalid={Boolean(errors?.phone)}
              autoComplete="tel"
            />
          </Field>
          <Field label="WhatsApp" htmlFor="whatsapp" error={errors?.whatsapp}>
            <Input
              id="whatsapp"
              name="whatsapp"
              type="tel"
              inputMode="tel"
              value={values.whatsapp}
              onChange={(e) => set("whatsapp", e.target.value)}
              placeholder="77 123 45 67"
              invalid={Boolean(errors?.whatsapp)}
            />
          </Field>
        </div>

        <Field label="E-mail" htmlFor="email" error={errors?.email}>
          <Input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            value={values.email}
            onChange={(e) => set("email", e.target.value)}
            placeholder="awa@exemple.fr"
            invalid={Boolean(errors?.email)}
            autoComplete="email"
          />
        </Field>

        <Field label="Adresse" htmlFor="address" error={errors?.address}>
          <Input
            id="address"
            name="address"
            value={values.address}
            onChange={(e) => set("address", e.target.value)}
            placeholder="Quartier, rue…"
            invalid={Boolean(errors?.address)}
            autoComplete="street-address"
          />
        </Field>

        <Field label="Notes" htmlFor="notes" error={errors?.notes}>
          <Textarea
            id="notes"
            name="notes"
            rows={3}
            value={values.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Préférences, particularités…"
            invalid={Boolean(errors?.notes)}
          />
        </Field>

        <div className="flex justify-end gap-2 border-t border-anthracite-100 pt-4">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            Annuler
          </Button>
          <Button type="submit" loading={busy}>
            {initial?.full_name ? "Enregistrer" : "Créer le client"}
          </Button>
        </div>
      </form>
    </div>
  );
}