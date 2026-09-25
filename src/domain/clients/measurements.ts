export type MeasurementFieldKind = "number" | "text";

export interface MeasurementField {
  key: string;
  label: string;
  kind: MeasurementFieldKind;
  unit: string;
}

export interface MeasurementProfile {
  id: string;
  tenant_id: string;
  name: string;
  fields: MeasurementField[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface MeasurementSnapshot {
  id: string;
  tenant_id: string;
  customer_id: string;
  profile_id: string | null;
  order_id: string | null;
  values: Record<string, number | string>;
  unit: string;
  notes: string | null;
  taken_at: string;
  taken_by: string | null;
  created_at: string;
}

export interface RawProfileField {
  key: string;
  label: string;
  kind?: MeasurementFieldKind;
  unit?: string;
}

export type ProfileValidationFailure = { ok: false; errors: Record<string, string> };
export type ProfileValidationSuccess = { ok: true; fields: MeasurementField[] };
export type ProfileValidationResult = ProfileValidationFailure | ProfileValidationSuccess;

export interface ProfileNameResult {
  ok: boolean;
  errors: Record<string, string>;
  name: string;
}

export const PROFILE_NAME_MAX = 80;
export const DEFAULT_PROFILE_UNIT = "cm";
export const PROFILE_FIELD_KEY_RE = /^[a-z][a-z0-9_]*$/;
export const PROFILE_FIELDS_MAX = 60;
export const PROFILE_FIELD_LABEL_MAX = 60;
export const PROFILE_FIELD_UNIT_MAX = 12;

export function normalizeProfileName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function validateProfileName(value: string): ProfileNameResult {
  const name = normalizeProfileName(value);
  const errors: Record<string, string> = {};
  if (name.length < 2 || name.length > PROFILE_NAME_MAX) {
    errors.name = `Le nom doit contenir entre 2 et ${PROFILE_NAME_MAX} caractères.`;
  }
  return { ok: Object.keys(errors).length === 0, errors, name };
}

export function normalizeFieldKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function normalizeProfileFields(input: RawProfileField[]): ProfileValidationResult {
  const errors: Record<string, string> = {};
  if (input.length > PROFILE_FIELDS_MAX) {
    errors.generic = `Maximum ${PROFILE_FIELDS_MAX} mesures par profil.`;
    return { ok: false, errors };
  }

  const seen = new Set<string>();
  const unique = new Map<string, RawProfileField & { kind: MeasurementFieldKind; unit: string }>();

  for (const raw of input) {
    const key = normalizeFieldKey(raw.key);
    if (key === "") {
      errors.generic = "Clé de mesure vide.";
      return { ok: false, errors };
    }
    if (!PROFILE_FIELD_KEY_RE.test(key)) {
      errors[key] = "Clé invalide (minuscules, chiffres, tirets bas).";
      continue;
    }
    if (seen.has(key)) {
      errors[key] = "Clé en double.";
      continue;
    }
    seen.add(key);

    const label = raw.label.trim();
    if (label === "" || label.length > PROFILE_FIELD_LABEL_MAX) {
      errors[key] = "Libellé vide ou trop long.";
      continue;
    }

    const kind = raw.kind === "text" ? "text" : "number";
    const unit =
      raw.unit !== undefined && raw.unit.trim() !== "" ? raw.unit.trim().slice(0, PROFILE_FIELD_UNIT_MAX) : DEFAULT_PROFILE_UNIT;
    unique.set(key, { key, label, kind, unit });
  }

  for (const err of Object.values(errors)) {
    if (err.startsWith("Libellé") || err.startsWith("Clé")) return { ok: false, errors };
  }

  return { ok: true, fields: [...unique.values()] };
}

export function isMeasurementField(
  value: unknown,
  kind: MeasurementFieldKind,
): value is number | string {
  if (kind === "text") return typeof value === "string";
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function normalizeSnapshotValues(
  fields: MeasurementField[],
  values: Record<string, unknown>,
): { values: Record<string, number | string>; ignored: string[] } {
  const out: Record<string, number | string> = {};
  const ignored: string[] = [];
  const known = new Set(fields.map((f) => f.key));

  for (const [key, raw] of Object.entries(values)) {
    if (!raw) continue;
    const field = fields.find((f) => f.key === key);
    if (!field || !known.has(key)) {
      ignored.push(key);
      continue;
    }
    const kind = field.kind === "text" ? "text" : "number";
    if (kind === "number") {
      if (typeof raw === "string" && raw.trim() !== "") {
        const num = Number(raw.replace(",", "."));
        if (Number.isFinite(num) && num >= 0) {
          out[key] = num;
        } else {
          ignored.push(key);
        }
      } else if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) {
        out[key] = raw;
      } else {
        ignored.push(key);
      }
    } else if (typeof raw === "string" && raw.trim() !== "") {
      out[key] = raw.trim();
    } else {
      ignored.push(key);
    }
  }
  return { values: out, ignored };
}

export function latestSnapshot(
  snapshots: MeasurementSnapshot[],
): MeasurementSnapshot | null {
  let latest: MeasurementSnapshot | null = null;
  for (const s of snapshots) {
    if (latest === null || s.taken_at > latest.taken_at) latest = s;
  }
  return latest;
}

export interface HydratedMeasurement {
  profile_id: string | null;
  profile_name: string | null;
  taken_at: string | null;
  taken_by: string | null;
  unit: string;
  notes: string | null;
  entries: Array<{
    key: string;
    label: string;
    unit: string;
    value: number | string | null;
  }>;
}

export function hydrateMeasurement(
  snapshot: MeasurementSnapshot | null,
  profile: MeasurementProfile | null,
): HydratedMeasurement {
  if (snapshot === null) {
    return { profile_id: null, profile_name: null, taken_at: null, taken_by: null, unit: "cm", notes: null, entries: [] };
  }
  const byKey = new Map(profile?.fields.map((f) => [f.key, f]) ?? []);
  const ordering = profile?.fields.map((f) => f.key) ?? Object.keys(snapshot.values ?? {});
  const keys = new Set([...ordering]);
  for (const key of Object.keys(snapshot.values)) keys.add(key);

  const entries = [...keys].map((key) => {
    const field = byKey.get(key);
    const value = snapshot.values[key] ?? null;
    return {
      key,
      label: field?.label ?? key,
      unit: field?.unit ?? snapshot.unit,
      value,
    };
  });

  return {
    profile_id: snapshot.profile_id,
    profile_name: profile?.name ?? null,
    taken_at: snapshot.taken_at,
    taken_by: snapshot.taken_by,
    unit: snapshot.unit,
    notes: snapshot.notes,
    entries,
  };
}