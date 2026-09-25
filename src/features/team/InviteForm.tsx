"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Button, Field, Input, Select } from "@/ui";
import { ROLE_OPTIONS } from "./constants";
import { ROLE_META } from "./constants";

export interface InviteFormValues {
  fullName: string;
  phone: string;
  role: string;
}

export interface InviteFormProps {
  busy?: boolean;
  errors?: Record<string, string> | null;
  onSubmit: (values: InviteFormValues) => Promise<void>;
  onCancel: () => void;
}

export function InviteForm({ busy, errors, onSubmit, onCancel }: InviteFormProps) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("EMPLOYEE");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="flex size-9 items-center justify-center rounded-full bg-champagne-400 text-chocolat-950">
          <UserPlus className="size-4" aria-hidden="true" />
        </span>
        <h2 className="font-display text-2xl text-ink">Inviter un membre</h2>
      </div>

      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          void onSubmit({ fullName, phone, role });
        }}
        noValidate
      >
        <Field label="Nom complet" required htmlFor="team-fullname" error={errors?.fullName}>
          <Input
            id="team-fullname"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Ex : Sita Ndiaye"
            invalid={Boolean(errors?.fullName)}
          />
        </Field>

        <Field
          label="Téléphone (WhatsApp)"
          htmlFor="team-phone"
          error={errors?.phone}
          hint="Optionnel — sert aux rappels de l'atelier"
        >
          <Input
            id="team-phone"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+221 77 123 45 67"
            invalid={Boolean(errors?.phone)}
          />
        </Field>

        <Field label="Rôle" required htmlFor="team-role" error={errors?.role}>
          <Select
            id="team-role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            invalid={Boolean(errors?.role)}
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {ROLE_META[r].label}
              </option>
            ))}
          </Select>
        </Field>

        <p className="text-sm text-ink-soft">
          L&apos;invitation est créée au statut « Invitée ». Le membre
          accepte depuis un appareil de l&apos;atelier.
        </p>

        <div className="flex justify-end gap-2 border-t border-anthracite-100 pt-4">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            Annuler
          </Button>
          <Button type="submit" loading={busy}>
            Envoyer l&apos;invitation
          </Button>
        </div>
      </form>
    </div>
  );
}