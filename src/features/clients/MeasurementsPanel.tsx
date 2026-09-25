"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Ruler } from "lucide-react";
import { Button, Field, Input, Select, Textarea, StateView } from "@/ui";
import type { HydratedMeasurement } from "@/domain/clients/measurements";
import type { MeasurementProfile } from "@/domain/clients/measurements";
import { getClientsFacade } from "./facade";

export interface MeasurementsPanelProps {
  customerId: string;
  onNewProfile: () => void;
}

export function MeasurementsPanel({
  customerId,
  onNewProfile,
}: MeasurementsPanelProps): React.ReactElement {
  const [profiles, setProfiles] = useState<MeasurementProfile[]>([]);
  const [profileId, setProfileId] = useState<string>("");
  const [latest, setLatest] = useState<HydratedMeasurement | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const reload = useCallback(async () => {
    const facade = getClientsFacade();
    const [list, hydrated] = await Promise.all([
      facade.measures.listProfiles(),
      facade.measures.latestMeasurements(customerId),
    ]);
    setProfiles(list);
    setLatest(hydrated);
    if (profileId === "" && list.length > 0) {
      setProfileId(list[0].id);
    }
    setNotes(hydrated.notes ?? "");
    setLoading(false);
  }, [customerId, profileId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await reload();
      } catch {
        if (!cancelled) setError("Impossible de charger les mesures.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const activeProfile =
    profiles.find((p) => p.id === profileId) ?? profiles[0] ?? null;

  async function save() {
    if (!activeProfile) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const result = await getClientsFacade().measures.saveMeasurements({
        customerId,
        profileId: activeProfile.id,
        values,
        notes: notes.trim() !== "" ? notes.trim() : null,
      });
      if (!result.ok) {
        setError("Valeurs de mesures invalides.");
        return;
      }
      setSaved(true);
      setValues({});
      setNotes("");
      setLatest(
        await getClientsFacade().measures.latestMeasurements(customerId),
      );
    } catch {
      setError("Enregistrement local impossible.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <StateView variant="loading" title="Chargement des mesures…" />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-full bg-info-soft text-info">
            <Ruler className="size-4" aria-hidden="true" />
          </span>
          <h3 className="font-display text-xl text-ink">Mesures</h3>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onNewProfile}>
          <Plus className="size-4" aria-hidden="true" />
          Profil
        </Button>
      </div>

      {saved ? (
        <p className="rounded-md bg-success-soft px-3 py-2 text-sm text-success" role="status">
          Mesures enregistrées localement, synchronisation en attente.
        </p>
      ) : null}
      {error ? (
        <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {profiles.length === 0 ? (
        <StateView
          variant="empty"
          title="Aucun profil de mesures"
          description="Créez un profil (ex : Costume homme, Robe) pour saisir les mesures du client."
          action={
            <Button type="button" variant="outline" size="sm" onClick={onNewProfile}>
              Créer un profil
            </Button>
          }
        />
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Field label="Profil de mesures" htmlFor="profile">
            <Select
              id="profile"
              value={activeProfile?.id ?? ""}
              onChange={(e) => {
                setProfileId(e.target.value);
                setValues({});
              }}
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>

          {activeProfile ? (
            <div className="grid gap-3 min-[480px]:grid-cols-2">
              {activeProfile.fields.map((field) => (
                <Field key={field.key} label={field.label}>
                  <Input
                    name={field.key}
                    type={field.kind === "text" ? "text" : "number"}
                    inputMode={field.kind === "text" ? "text" : "decimal"}
                    step={field.kind === "text" ? undefined : "0.1"}
                    min={field.kind === "text" ? undefined : 0}
                    value={values[field.key] ?? ""}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, [field.key]: e.target.value }))
                    }
                    placeholder={field.kind === "number" ? `en ${field.unit}` : ""}
                  />
                </Field>
              ))}
            </div>
          ) : null}

          <Field label="Notes">
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Postures, précisions du client…"
            />
          </Field>

          <div className="flex justify-end">
            <Button type="submit" loading={saving}>
              Enregistrer les mesures
            </Button>
          </div>
        </form>
      )}

      {latest?.entries.length ? (
        <div className="mt-2 rounded-lg border border-outline bg-surface-2 p-4">
          <p className="text-sm font-medium text-ink">
            {latest.profile_name ?? "Dernières mesures"}
          </p>
          <p className="text-xs text-ink-soft">
            Prise le {new Date(latest.taken_at ?? "").toLocaleDateString("fr-FR")}
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 min-[480px]:grid-cols-3">
            {latest.entries
              .filter((e) => e.value !== null)
              .map((e) => (
                <div key={e.key} className="flex items-baseline justify-between gap-2">
                  <dt className="truncate text-xs text-ink-soft">{e.label}</dt>
                  <dd className="text-sm font-medium text-ink">
                    {e.value}
                    <span className="ml-1 text-xs text-ink-faint">{e.unit}</span>
                  </dd>
                </div>
              ))}
          </dl>
        </div>
      ) : null}
    </div>
  );
}