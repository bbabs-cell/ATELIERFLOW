import { SyncEngine } from "@/application/sync/engine";
import { newIdempotencyKey } from "@/domain/ids/idempotency";
import {
  fieldsFor,
  hydrateMeasurement,
  normalizeProfileFields,
  normalizeProfileName,
  normalizeSnapshotValues,
  type HydratedMeasurement,
  type MeasurementProfile,
  type MeasurementSnapshot,
  type RawProfileField,
  validateProfileName,
} from "@/domain/clients/measurements";
import type {
  ProfilesRepository,
  SnapshotsRepository,
} from "@/repository/ports/clients";

export type ProfileResult =
  | { ok: true; profile: MeasurementProfile }
  | { ok: false; errors: Record<string, string> };

export type SnapshotResult =
  | { ok: true; snapshot: MeasurementSnapshot; ignored: string[] }
  | { ok: false; errors: Record<string, string> };

export interface MeasurementService {
  listProfiles(): Promise<MeasurementProfile[]>;
  createProfile(input: {
    name: string;
    fields: RawProfileField[];
  }): Promise<ProfileResult>;
  updateProfile(
    id: string,
    input: { name: string; fields: RawProfileField[] },
  ): Promise<ProfileResult>;
  saveMeasurements(input: {
    customerId: string;
    profileId: string | null;
    values: Record<string, unknown>;
    notes?: string | null;
    takenAt?: string;
    /** Commande pour laquelle les mesures sont prises (prise de commande). */
    orderId?: string | null;
  }): Promise<SnapshotResult>;
  latestMeasurements(customerId: string): Promise<HydratedMeasurement>;
  /** Mesures prises avec une commande (la plus récente), ou null. */
  orderMeasurements(customerId: string, orderId: string): Promise<HydratedMeasurement | null>;
}

export interface MeasurementServiceDeps {
  tenantId: string;
  profileId: string | null;
  profiles: ProfilesRepository;
  snapshots: SnapshotsRepository;
  engine: SyncEngine;
  now?: () => string;
  uuid?: () => string;
}

const PROFILES = "measurement_profiles";
const SNAPSHOTS = "measurement_snapshots";

export function createMeasurementService(
  deps: MeasurementServiceDeps,
): MeasurementService {
  const now = deps.now ?? (() => new Date().toISOString());
  const port = typeof globalThis.crypto?.randomUUID === "function" ? globalThis.crypto : undefined;
  const uuid = deps.uuid ?? (() => port?.randomUUID() ?? newIdempotencyKey());

  function timestampCompare(a: string | null, b: string | null): number {
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return a.localeCompare(b);
  }

  async function assertNameUnique(
    name: string,
    selfId: string | null,
  ): Promise<string | null> {
    const profiles = await deps.profiles.listProfiles();
    const fold = normalizeProfileName(name).toLowerCase();
    const dup = profiles.find(
      (p) => p.id !== selfId && p.deleted_at === null && p.name.toLowerCase() === fold,
    );
    return dup ? "Un profil porte déjà ce nom." : null;
  }

  async function buildAndSaveProfile(
    id: string,
    name: string,
    fields: RawProfileField[],
    createdBy: string | null,
    createdAt: string,
  ): Promise<ProfileResult> {
    const nameResult = validateProfileName(name);
    const fieldsResult = normalizeProfileFields(fields);
    if (!nameResult.ok || !fieldsResult.ok) {
      const errors: Record<string, string> = {
        ...(nameResult.ok ? {} : nameResult.errors),
        ...(fieldsResult.ok ? {} : fieldsResult.errors),
      };
      return { ok: false, errors };
    }

    const duplicate = await assertNameUnique(nameResult.name, id === "" ? null : id);
    if (duplicate !== null) return { ok: false, errors: { name: duplicate } };

    const profile: MeasurementProfile = {
      id,
      tenant_id: deps.tenantId,
      name: nameResult.name,
      fields: fieldsResult.fields,
      created_by: createdBy,
      created_at: createdAt,
      updated_at: createdAt,
      deleted_at: null,
    };
    await deps.profiles.saveProfile(profile);
    await deps.engine.enqueue({
      tenantId: deps.tenantId,
      profileId: deps.profileId,
      entity: PROFILES,
      entityId: id,
      operation: "INSERT",
      payload: profile,
    });
    return { ok: true, profile };
  }

  return {
    async listProfiles() {
      return deps.profiles.listProfiles();
    },

    async createProfile(input) {
      return buildAndSaveProfile(uuid(), input.name, input.fields, deps.profileId, now());
    },

    async updateProfile(id, input) {
      const existing = await deps.profiles.getProfile(id);
      if (existing === null) return { ok: false, errors: { generic: "Profil introuvable." } };
      const nameResult = validateProfileName(input.name);
      const fieldsResult = normalizeProfileFields(input.fields);
      if (!nameResult.ok || !fieldsResult.ok) {
        const errors: Record<string, string> = {
          ...(nameResult.ok ? {} : nameResult.errors),
          ...(fieldsResult.ok ? {} : fieldsResult.errors),
        };
        return { ok: false, errors };
      }

      const duplicate = await assertNameUnique(nameResult.name, id);
      if (duplicate !== null) return { ok: false, errors: { name: duplicate } };

      const profile: MeasurementProfile = {
        ...existing,
        name: nameResult.name,
        fields: fieldsResult.fields,
        updated_at: now(),
      };
      await deps.profiles.saveProfile(profile);
      await deps.engine.enqueue({
        tenantId: deps.tenantId,
        profileId: deps.profileId,
        entity: PROFILES,
        entityId: id,
        operation: "UPDATE",
        payload: profile,
      });
      return { ok: true, profile };
    },

    async saveMeasurements(input) {
      const errors: Record<string, string> = {};
      let profile: MeasurementProfile | null = null;
      if (input.profileId !== null) {
        profile = await deps.profiles.getProfile(input.profileId);
        if (profile === null) {
          errors.generic = "Profil de mesures introuvable.";
          return { ok: false, errors };
        }
      }
      const normalized = normalizeSnapshotValues([...fieldsFor(profile)], input.values);
      if (Object.keys(normalized.values).length === 0) {
        errors.generic = "Aucune mesure saisie.";
        return { ok: false, errors };
      }
      const taken_at = input.takenAt !== undefined ? (input.takenAt ?? now()) : now();

      const snapshot: MeasurementSnapshot = {
        id: uuid(),
        tenant_id: deps.tenantId,
        customer_id: input.customerId,
        profile_id: profile?.id ?? null,
        order_id: input.orderId ?? null,
        values: normalized.values,
        unit: "cm",
        notes: input.notes !== undefined ? input.notes ?? null : null,
        taken_at,
        taken_by: deps.profileId,
        created_at: now(),
      };
      await deps.snapshots.saveSnapshot(snapshot);
      await deps.engine.enqueue({
        tenantId: deps.tenantId,
        profileId: deps.profileId,
        entity: SNAPSHOTS,
        entityId: snapshot.id,
        operation: "INSERT",
        payload: snapshot,
      });
      return { ok: true, snapshot, ignored: normalized.ignored };
    },

    async orderMeasurements(customerId, orderId) {
      const [snapshots, profiles] = await Promise.all([
        deps.snapshots.listSnapshots(customerId),
        deps.profiles.listProfiles(),
      ]);
      const forOrder = snapshots
        .filter((s) => s.order_id === orderId)
        .sort((a, b) => timestampCompare(b.taken_at, a.taken_at))[0];
      if (!forOrder) return null;
      const profile = forOrder.profile_id ? profiles.find((p) => p.id === forOrder.profile_id) ?? null : null;
      return hydrateMeasurement(forOrder, profile);
    },

    async latestMeasurements(customerId) {
      const [snapshots, profiles] = await Promise.all([
        deps.snapshots.listSnapshots(customerId),
        deps.profiles.listProfiles(),
      ]);
      const snapshotsByNewest = [...snapshots].sort((a, b) =>
        timestampCompare(b.taken_at, a.taken_at),
      );
      const latest = snapshotsByNewest[0] ?? null;
      const profile =
        latest?.profile_id !== null
          ? profiles.find((p) => p.id === latest?.profile_id) ?? null
          : null;
      return hydrateMeasurement(latest, profile);
    },
  };
}