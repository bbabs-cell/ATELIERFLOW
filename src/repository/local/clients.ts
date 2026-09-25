import type { Customer, CustomerStatus } from "@/domain/clients/customer";
import type {
  MeasurementProfile,
  MeasurementSnapshot,
} from "@/domain/clients/measurements";
import { matchesSearch } from "@/domain/clients/customer";
import type { LocalCachePort } from "@/repository/ports/sync";
import type {
  CustomersRepository,
  ProfilesRepository,
  SnapshotsRepository,
} from "@/repository/ports/clients";

const CUSTOMERS_ENTITY = "customers";
const PROFILES_ENTITY = "measurement_profiles";
const SNAPSHOTS_ENTITY = "measurement_snapshots";

export function makeLocalCustomersRepository(
  cache: LocalCachePort,
): CustomersRepository {
  async function list(
    search: string,
    includeArchive: boolean,
  ): Promise<Customer[]> {
    const records = (await cache.list(CUSTOMERS_ENTITY)) as Customer[];
    return records
      .filter(
        (c) =>
          (includeArchive || (c.status as CustomerStatus) !== "ARCHIVED") &&
          matchesSearch(c, search),
      )
      .sort((a, b) => {
        const byName = a.full_name.localeCompare(b.full_name, "fr");
        if (byName !== 0) return byName;
        return b.created_at.localeCompare(a.created_at);
      });
  }

  async function getCustomer(id: string): Promise<Customer | null> {
    return (await cache.get(CUSTOMERS_ENTITY, id)) as Customer | null;
  }

  async function saveCustomer(customer: Customer): Promise<void> {
    await cache.put(CUSTOMERS_ENTITY, customer.id, customer);
  }

  return { list, getCustomer, saveCustomer };
}

export function makeLocalProfilesRepository(
  cache: LocalCachePort,
): ProfilesRepository {
  async function listProfiles(): Promise<MeasurementProfile[]> {
    return (await cache.list(PROFILES_ENTITY)) as MeasurementProfile[];
  }

  async function getProfile(id: string): Promise<MeasurementProfile | null> {
    return (await cache.get(PROFILES_ENTITY, id)) as MeasurementProfile | null;
  }

  async function saveProfile(profile: MeasurementProfile): Promise<void> {
    await cache.put(PROFILES_ENTITY, profile.id, profile);
  }

  return { listProfiles, getProfile, saveProfile };
}

export function makeLocalSnapshotsRepository(
  cache: LocalCachePort,
): SnapshotsRepository {
  async function listSnapshots(customerId: string): Promise<MeasurementSnapshot[]> {
    const records = (await cache.list(SNAPSHOTS_ENTITY)) as MeasurementSnapshot[];
    return records
      .filter((s) => s.customer_id === customerId)
      .sort((a, b) => b.taken_at.localeCompare(a.taken_at));
  }

  async function getSnapshot(id: string): Promise<MeasurementSnapshot | null> {
    return (await cache.get(SNAPSHOTS_ENTITY, id)) as MeasurementSnapshot | null;
  }

  async function saveSnapshot(snapshot: MeasurementSnapshot): Promise<void> {
    await cache.put(SNAPSHOTS_ENTITY, snapshot.id, snapshot);
  }

  return { listSnapshots, getSnapshot, saveSnapshot };
}

export function makeLocalClientsStores(cache: LocalCachePort): {
  customers: CustomersRepository;
  profiles: ProfilesRepository;
  snapshots: SnapshotsRepository;
} {
  return {
    customers: makeLocalCustomersRepository(cache),
    profiles: makeLocalProfilesRepository(cache),
    snapshots: makeLocalSnapshotsRepository(cache),
  };
}