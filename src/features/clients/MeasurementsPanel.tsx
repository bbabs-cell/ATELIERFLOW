"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Ruler } from "lucide-react";
import { Button, Field, Select, Textarea, StateView } from "@/ui";
import { DEFAULT_PROFILE_NAME, fieldsFor, type HydratedMeasurement, type MeasurementProfile } from "@/domain/clients/measurements";
import { MeasureFields } from "./MeasureFields";
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
    setNotes(hydrated.notes ?? "");
    setLoading(false);
  }, [customerId]);

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

  // Sans profil choisi : les mesures de base (aucun profil à créer avant de mesurer).
  const activeProfile = profiles.find((p) => p.id === profileId) ?? null;
  const fields = fieldsFor(activeProfile);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const result = await getClientsFacade().measures.saveMeasurements({
        customerId,
        profileId: activeProfile?.id ?? null,
        values,
        notes: notes.trim() !== "" ? notes.trim() : null,
      });
      if (!result.ok) {
        setError(result.errors.generic === "Aucune mesure saisie." ? "Remplissez au moins une mesure." : "Valeurs de mesures invalides.");
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

      <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          {profiles.length > 0 ? (
            <Field label="Type de mesures" htmlFor="profile">
              <Select
                id="profile"
                value={profileId}
                onChange={(e) => {
                  setProfileId(e.target.value);
                  setValues({});
                }}
              >
                <option value="">{DEFAULT_PROFILE_NAME}</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          <MeasureFields
            idPrefix="client-measure"
            fields={fields}
            values={values}
            onChange={(key, value) => setValues((v) => ({ ...v, [key]: value }))}
          />

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

      {latest?.entries.length ? (
        <div className="mt-2 rounded-xl border border-outline bg-surface-2/80 p-4">
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
                    {typeof e.value === "number" ? e.value.toLocaleString("fr-FR") : e.value}
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