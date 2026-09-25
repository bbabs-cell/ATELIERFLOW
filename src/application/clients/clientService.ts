import { SyncEngine } from "@/application/sync/engine";
import {
  archiveCustomer,
  samePhoneWithinTenant,
  type ContactErrors,
  type Customer,
  type CustomerContactInput,
  type NormalizedContact,
  normalizeContact,
} from "@/domain/clients/customer";
import { newIdempotencyKey } from "@/domain/ids/idempotency";
import type {
  CustomersRepository,
  ProfilesRepository,
  SnapshotsRepository,
} from "@/repository/ports/clients";

export type CreateCustomerResult =
  | { ok: true; customer: Customer }
  | { ok: false; errors: ContactErrors };

export type UpdateCustomerResult =
  | { ok: true; customer: Customer }
  | { ok: false; errors: ContactErrors };

export interface ClientsService {
  listCustomers(input: {
    search?: string;
    includeArchive?: boolean;
  }): Promise<Customer[]>;
  getCustomer(id: string): Promise<Customer | null>;
  createCustomer(input: CustomerContactInput): Promise<CreateCustomerResult>;
  updateCustomer(
    id: string,
    input: CustomerContactInput,
  ): Promise<UpdateCustomerResult>;
  archiveCustomer(id: string): Promise<Customer | null>;
}

export interface ClientsServiceDeps {
  tenantId: string;
  profileId: string | null;
  customers: CustomersRepository;
  profiles: ProfilesRepository;
  snapshots: SnapshotsRepository;
  engine: SyncEngine;
  now?: () => string;
  uuid?: () => string;
}

const CUSTOMERS = "customers";

export function createClientsService(deps: ClientsServiceDeps): ClientsService {
  const now = deps.now ?? (() => new Date().toISOString());
  const port = typeof globalThis.crypto?.randomUUID === "function" ? globalThis.crypto : undefined;
  const uuid = deps.uuid ?? (() => port?.randomUUID() ?? newIdempotencyKey());

  function buildCustomer(
    id: string,
    input: NormalizedContact,
  ): Customer {
    return {
      id,
      tenant_id: deps.tenantId,
      full_name: input.full_name,
      phone: input.phone,
      whatsapp: input.whatsapp,
      email: input.email,
      address: input.address,
      notes: input.notes,
      photo_key: null,
      status: "ACTIVE",
      created_by: deps.profileId,
      created_at: now(),
      updated_at: now(),
      deleted_at: null,
    };
  }

  async function findActivePhoneConflict(
    self: Customer | null,
    phone: string | null,
  ): Promise<Customer | null> {
    if (phone === null) return null;
    const all = await deps.customers.list("", true);
    return (
      all.find(
        (c) => c.id !== self?.id && samePhoneWithinTenant(c, { phone, status: "ACTIVE" }),
      ) ?? null
    );
  }

  function enqueueWrite(
    id: string,
    operation: "INSERT" | "UPDATE",
    payload: Customer,
  ): Promise<unknown> {
    return deps.engine.enqueue({
      tenantId: deps.tenantId,
      profileId: deps.profileId,
      entity: CUSTOMERS,
      entityId: id,
      operation,
      payload,
    });
  }

  return {
    async listCustomers({ search = "", includeArchive = false }) {
      return deps.customers.list(search, includeArchive);
    },

    async getCustomer(id) {
      return deps.customers.getCustomer(id);
    },

    async createCustomer(input) {
      const validated = normalizeContact(input);
      if (!validated.ok) return { ok: false, errors: validated.errors };

      const conflict = await findActivePhoneConflict(null, validated.value.phone);
      if (conflict !== null) {
        return {
          ok: false,
          errors: {
            phone: "Ce numéro est déjà utilisé par un client actif.",
            generic: "Un client actif porte déjà ce numéro de téléphone.",
          },
        };
      }

      const id = uuid();
      const customer = buildCustomer(id, validated.value);
      await deps.customers.saveCustomer(customer);
      await enqueueWrite(id, "INSERT", customer);
      return { ok: true, customer };
    },

    async updateCustomer(id, input) {
      const existing = await deps.customers.getCustomer(id);
      if (existing === null) {
        return { ok: false, errors: { generic: "Client introuvable." } };
      }
      const validated = normalizeContact(input);
      if (!validated.ok) return { ok: false, errors: validated.errors };

      const conflict = await findActivePhoneConflict(
        existing,
        validated.value.phone,
      );
      if (conflict !== null) {
        return {
          ok: false,
          errors: {
            phone: "Ce numéro est déjà utilisé par un client actif.",
            generic: "Un client actif porte déjà ce numéro de téléphone.",
          },
        };
      }

      const customer: Customer = {
        ...existing,
        ...validated.value,
        updated_at: now(),
      };
      await deps.customers.saveCustomer(customer);
      await enqueueWrite(id, "UPDATE", customer);
      return { ok: true, customer };
    },

    async archiveCustomer(id) {
      const existing = await deps.customers.getCustomer(id);
      if (existing === null) return null;
      const customer = archiveCustomer(existing, now());
      await deps.customers.saveCustomer(customer);
      await enqueueWrite(id, "UPDATE", customer);
      return customer;
    },
  };
}