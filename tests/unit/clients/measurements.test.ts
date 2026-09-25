import { describe, expect, it } from "vitest";
import {
  hydrateMeasurement,
  latestSnapshot,
  normalizeProfileFields,
  normalizeSnapshotValues,
  validateProfileName,
  type MeasurementField,
  type MeasurementProfile,
  type MeasurementSnapshot,
} from "@/domain/clients/measurements";

const STANDARD_FIELDS: MeasurementField[] = [
  { key: "shoulder", label: "Épaule", kind: "number", unit: "cm" },
  { key: "chest", label: "Poitrine", kind: "number", unit: "cm" },
  { key: "hip", label: "Hanches", kind: "number", unit: "cm" },
  { key: "note_color", label: "Couleur souhaitée", kind: "text", unit: "cm" },
];

const PROFILE_FIELDS: MeasurementField[] = [
  { key: "bust", label: "Poitrine", kind: "number", unit: "cm" },
  { key: "note", label: "Note", kind: "text", unit: "cm" },
];

function snap(overrides: Partial<MeasurementSnapshot> = {}): MeasurementSnapshot {
  return {
    id: "s1",
    tenant_id: "t1",
    customer_id: "c1",
    profile_id: "p1",
    order_id: null,
    values: {},
    unit: "cm",
    notes: null,
    taken_at: "2026-01-01T00:00:00.000Z",
    taken_by: "u1",
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function profile(overrides: Partial<MeasurementProfile> = {}): MeasurementProfile {
  return {
    id: "p1",
    tenant_id: "t1",
    name: "Robe",
    fields: PROFILE_FIELDS,
    created_by: "u1",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    deleted_at: null,
    ...overrides,
  };
}

describe("profils de mesures", () => {
  it("normalise le nom du profil", () => {
    const r = validateProfileName("  Costume   homme ");
    expect(r.ok).toBe(true);
    expect(r.name).toBe("Costume homme");
  });

  it("rejette un nom trop court", () => {
    const r = validateProfileName("X");
    expect(r.ok).toBe(false);
  });

  it("normalise les champs : clés, unité par défaut, type par défaut", () => {
    const r = normalizeProfileFields(STANDARD_FIELDS);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const byKey = new Map(r.fields.map((f) => [f.key, f]));
      expect(byKey.get("shoulder")?.kind).toBe("number");
      expect(byKey.get("shoulder")?.unit).toBe("cm");
      expect(byKey.get("hip")?.kind).toBe("number");
      expect(byKey.get("note_color")?.kind).toBe("text");
      expect(byKey.get("note_color")?.unit).toBe("cm");
    }
  });

  it("rejette les clés en double", () => {
    const r = normalizeProfileFields([
      { key: "chest", label: "Poitrine" },
      { key: "chest", label: "Poitrine" },
    ]);
    expect(r.ok).toBe(false);
  });

  it("normalise une clé en minuscules sans la rejeter", () => {
    const r = normalizeProfileFields([{ key: "Poitrine", label: "Poitrine" }]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.fields[0].key).toBe("poitrine");
  });

  it("rejette un libellé vide", () => {
    const r = normalizeProfileFields([{ key: "chest", label: "   " }]);
    expect(r.ok).toBe(false);
  });

  it("respecte la limite de champs", () => {
    const tooMany = Array.from({ length: 61 }, (_, i) => ({
      key: `f${i}`,
      label: `Mesure ${i}`,
    }));
    const r = normalizeProfileFields(tooMany);
    expect(r.ok).toBe(false);
  });
});

describe("snapshots de mesures", () => {
  it("conserve les valeurs numériques valides, ignore les invalides ou inconnues", () => {
    const { values, ignored } = normalizeSnapshotValues(STANDARD_FIELDS, {
      chest: "98",
      hip: 102,
      note_color: "  bleu  ",
      inconnue: 12,
    });
    expect(values.chest).toBe(98);
    expect(values.hip).toBe(102);
    expect(values.note_color).toBe("bleu");
    expect(ignored).toContain("inconnue");
  });

  it("ignore les valeurs négatives non-numériques", () => {
    const { values, ignored } = normalizeSnapshotValues(STANDARD_FIELDS, {
      chest: -5,
      shoulder: "abc",
    });
    expect(ignored).toContain("chest");
    expect(ignored).toContain("shoulder");
    expect(Object.keys(values).length).toBe(0);
  });

  it("retourne le snapshot le plus récent", () => {
    const old = snap({ taken_at: "2026-01-01T00:00:00.000Z" });
    const fresh = snap({ taken_at: "2026-03-01T00:00:00.000Z" });
    expect(latestSnapshot([old, fresh])).toBe(fresh);
    expect(latestSnapshot([])).toBeNull();
  });

  it("hydrate une snapshot avec les libellés et unités du profil", () => {
    const hydrated = hydrateMeasurement(
      snap({ values: { bust: 90, inconnue: 1 } }),
      profile(),
    );
    expect(hydrated.profile_name).toBe("Robe");
    expect(hydrated.entries).toHaveLength(3);
    const bust = hydrated.entries.find((e) => e.key === "bust");
    expect(bust?.label).toBe("Poitrine");
    expect(bust?.unit).toBe("cm");
    expect(bust?.value).toBe(90);
    const note = hydrated.entries.find((e) => e.key === "note");
    expect(note?.value).toBeNull();
    expect(hydrated.entries.some((e) => e.key === "inconnue")).toBe(true);
  });
});