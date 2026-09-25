import type { Customer } from "@/domain/clients/customer";
import type {
  MeasurementProfile,
  MeasurementSnapshot,
} from "@/domain/clients/measurements";

export interface CustomersRepository {
  list(search: string, includeArchive: boolean): Promise<Customer[]>;
  getCustomer(id: string): Promise<Customer | null>;
  saveCustomer(customer: Customer): Promise<void>;
}

export interface ProfilesRepository {
  listProfiles(): Promise<MeasurementProfile[]>;
  getProfile(id: string): Promise<MeasurementProfile | null>;
  saveProfile(profile: MeasurementProfile): Promise<void>;
}

export interface SnapshotsRepository {
  listSnapshots(customerId: string): Promise<MeasurementSnapshot[]>;
  getSnapshot(id: string): Promise<MeasurementSnapshot | null>;
  saveSnapshot(snapshot: MeasurementSnapshot): Promise<void>;
}