"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Field, Input, Select } from "@/ui";
import type { MeasurementFieldKind } from "@/domain/clients/measurements";
import { getClientsFacade } from "./facade";

export interface ProfileFormProps {
  onDone: () => void;
  onCancel: () => void;
}

interface DraftField {
  id: string;
  label: string;
  kind: MeasurementFieldKind;
}

const EMPTY_FIELD: DraftField = { id: "f-0", label: "", kind: "number" };

export function ProfileForm({
  onDone,
  onCancel,
}: ProfileFormProps): React.ReactElement {
  const [name, setName] = useState("");
  const [fields, setFields] = useState<DraftField[]>([EMPTY_FIELD]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [nextId, setNextId] = useState(1);

  function addField() {
    setNextId((n) => n + 1);
    setFields((f) => [...f, { id: `f-${nextId}`, label: "", kind: "number" }]);
  }

  function removeField(id: string) {
    setFields((f) => f.filter((x) => x.id !== id));
  }

  function updateField(id: string, patch: Partial<DraftField>) {
    setFields((f) => f.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

  async function submit() {
    setErrors({});
    setSaving(true);
    try {
      const result = await getClientsFacade().measures.createProfile({
        name,
        fields: fields.map((f) => ({
          key: f.label,
          label: f.label,
          kind: f.kind,
        })),
      });
      if (!result.ok) {
        setErrors(result.errors);
        return;
      }
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      noValidate
    >
      <Field label="Nom du profil" required htmlFor="profile-name" error={errors.name}>
        <Input
          id="profile-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex : Costume homme, Robe de mariée"
          invalid={Boolean(errors.name)}
        />
      </Field>

      {errors.generic ? (
        <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
          {errors.generic}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-ink">Mesures du profil</p>
        {fields.map((field) => (
          <div key={field.id} className="grid grid-cols-[1fr_auto_auto] items-start gap-2">
            <div className="flex flex-col gap-1">
              <Input
                aria-label="Libellé de la mesure"
                value={field.label}
                onChange={(e) => updateField(field.id, { label: e.target.value })}
                placeholder="Ex : Poitrine"
              />
              {errors[field.label] ? (
                <p className="text-xs text-danger">{errors[field.label]}</p>
              ) : null}
            </div>
            <Select
              aria-label="Type de mesure"
              value={field.kind}
              onChange={(e) =>
                updateField(field.id, { kind: e.target.value as MeasurementFieldKind })
              }
              className="w-28"
            >
              <option value="number">Nombre (cm)</option>
              <option value="text">Texte</option>
            </Select>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Retirer la mesure"
              onClick={() => removeField(field.id)}
              disabled={fields.length === 1}
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          </div>
        ))}
        <div>
          <Button type="button" variant="outline" size="sm" onClick={addField}>
            <Plus className="size-4" aria-hidden="true" />
            Ajouter une mesure
          </Button>
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-anthracite-100 pt-4">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
          Annuler
        </Button>
        <Button type="submit" loading={saving}>
          Créer le profil
        </Button>
      </div>
    </form>
  );
}