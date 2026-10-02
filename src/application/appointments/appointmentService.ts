import { SyncEngine } from "@/application/sync/engine";
import { newIdempotencyKey } from "@/domain/ids/idempotency";
import {
  appointmentAfterTransition,
  canTransitionAppointment,
  isAppointmentEditable,
  isAppointmentStatus,
  validateAppointmentDraft,
} from "@/domain/appointments/appointments";
import type {
  AppointmentDraftErrors,
  AppointmentDraftInput,
  AppointmentRecord,
  AppointmentStatus,
  AppointmentType,
} from "@/domain/appointments/appointments";
import type { Customer } from "@/domain/clients/customer";
import type { OrderRecord } from "@/domain/orders/order";
import type { AppointmentsRepository } from "@/repository/ports/appointments";
import type { CustomersRepository } from "@/repository/ports/clients";
import type { OrdersRepository } from "@/repository/ports/orders";

const APPOINTMENTS_ENTITY = "appointments";

export interface AppointmentListItem {
  appointment: AppointmentRecord;
  customer: Customer | null;
  /** Commande liée, si elle est connue de l'appareil. */
  order: Pick<OrderRecord, "id" | "reference" | "status"> | null;
}

export type UpdateAppointmentResult =
  | { ok: true; appointment: AppointmentRecord; rescheduled: boolean }
  | { ok: false; errors: AppointmentDraftErrors & { generic?: string } };

export type CreateAppointmentResult =
  | { ok: true; appointment: AppointmentRecord }
  | { ok: false; errors: AppointmentDraftErrors };

export type TransitionAppointmentResult =
  | { ok: true; appointment: AppointmentRecord }
  | { ok: false; reason: string };

export interface AppointmentService {
  listAppointments(): Promise<AppointmentListItem[]>;
  getAppointment(id: string): Promise<AppointmentListItem | null>;
  createAppointment(
    input: AppointmentDraftInput,
  ): Promise<CreateAppointmentResult>;
  transitionAppointment(
    id: string,
    to: AppointmentStatus,
  ): Promise<TransitionAppointmentResult>;
  /** Modifie client, commande, type, horaire et note ; le statut ne change pas. */
  updateAppointment(id: string, input: AppointmentDraftInput): Promise<UpdateAppointmentResult>;
  /** Le rappel WhatsApp a été ouvert pour le client. */
  markReminderSent(id: string): Promise<TransitionAppointmentResult>;
}

export interface AppointmentServiceDeps {
  tenantId: string;
  profileId: string | null;
  appointments: AppointmentsRepository;
  customers: CustomersRepository;
  orders?: OrdersRepository;
  engine: SyncEngine;
  now?: () => string;
  uuid?: () => string;
}

export function createAppointmentService(
  deps: AppointmentServiceDeps,
): AppointmentService {
  const now = deps.now ?? (() => new Date().toISOString());
  const port =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto
      : undefined;
  const uuid = deps.uuid ?? (() => port?.randomUUID() ?? newIdempotencyKey());

  async function enqueue(
    operation: "INSERT" | "UPDATE",
    entity: string,
    entityId: string,
    payload: unknown,
  ) {
    await deps.engine.enqueue({
      tenantId: deps.tenantId,
      profileId: deps.profileId,
      entity,
      entityId,
      operation,
      payload,
    });
  }

  /** Commande liée : même atelier et même client que le rendez-vous. */
  async function checkOrder(orderId: string | null, customerId: string): Promise<string | null> {
    if (orderId === null || !deps.orders) return null;
    const order = await deps.orders.getOrder(orderId);
    if (order === null) return "Commande introuvable.";
    if (order.customer_id !== customerId) return "Cette commande appartient à un autre client.";
    return null;
  }

  async function toItem(appointment: AppointmentRecord): Promise<AppointmentListItem> {
    const [customer, order] = await Promise.all([
      deps.customers.getCustomer(appointment.customer_id),
      appointment.order_id && deps.orders ? deps.orders.getOrder(appointment.order_id) : Promise.resolve(null),
    ]);
    return {
      appointment,
      customer,
      order: order ? { id: order.id, reference: order.reference, status: order.status } : null,
    };
  }

  async function createAppointment(input: AppointmentDraftInput) {
    const draft = validateAppointmentDraft(input);
    if (Object.keys(draft.errors).length > 0) {
      return { ok: false as const, errors: draft.errors };
    }

    const customer = await deps.customers.getCustomer(draft.value.customerId);
    if (customer === null) {
      return {
        ok: false as const,
        errors: { customerId: "Client introuvable." } satisfies AppointmentDraftErrors,
      };
    }
    const orderError = await checkOrder(draft.value.orderId, customer.id);
    if (orderError !== null) {
      return { ok: false as const, errors: { orderId: orderError } satisfies AppointmentDraftErrors };
    }

    const appointment: AppointmentRecord = {
      id: uuid(),
      tenant_id: deps.tenantId,
      customer_id: draft.value.customerId,
      order_id: draft.value.orderId,
      type: draft.value.type as AppointmentType,
      starts_at: draft.value.startsAt,
      ends_at: draft.value.endsAt,
      status: "SCHEDULED",
      note: draft.value.note,
      reminder_sent_at: null,
      created_by: deps.profileId,
      created_at: now(),
      updated_at: now(),
      deleted_at: null,
    };

    await deps.appointments.saveAppointment(appointment);
    await enqueue("INSERT", APPOINTMENTS_ENTITY, appointment.id, appointment);
    return { ok: true as const, appointment };
  }

  async function updateAppointment(id: string, input: AppointmentDraftInput): Promise<UpdateAppointmentResult> {
    const current = await deps.appointments.getAppointment(id);
    if (current === null) return { ok: false, errors: { generic: "Rendez-vous introuvable." } };
    if (!isAppointmentEditable(current.status)) {
      return { ok: false, errors: { generic: "Un rendez-vous terminé ou annulé ne se modifie plus." } };
    }
    const draft = validateAppointmentDraft(input);
    if (Object.keys(draft.errors).length > 0) return { ok: false, errors: draft.errors };
    const customer = await deps.customers.getCustomer(draft.value.customerId);
    if (customer === null) return { ok: false, errors: { customerId: "Client introuvable." } };
    const orderError = await checkOrder(draft.value.orderId, customer.id);
    if (orderError !== null) return { ok: false, errors: { orderId: orderError } };

    const rescheduled = Date.parse(draft.value.startsAt) !== Date.parse(current.starts_at);
    const updated: AppointmentRecord = {
      ...current,
      customer_id: customer.id,
      order_id: draft.value.orderId,
      type: draft.value.type as AppointmentType,
      starts_at: draft.value.startsAt,
      ends_at: draft.value.endsAt,
      note: draft.value.note,
      // Nouvel horaire : le rappel déjà envoyé portait l'ancien, il faut le renvoyer.
      reminder_sent_at: rescheduled ? null : (current.reminder_sent_at ?? null),
      updated_at: now(),
    };
    await deps.appointments.saveAppointment(updated);
    await enqueue("UPDATE", APPOINTMENTS_ENTITY, updated.id, updated);
    return { ok: true, appointment: updated, rescheduled };
  }

  return {
    async listAppointments() {
      const records = await deps.appointments.listAll();
      return Promise.all(records.map(toItem));
    },
    async getAppointment(id) {
      const appointment = await deps.appointments.getAppointment(id);
      return appointment === null ? null : toItem(appointment);
    },
    createAppointment,
    updateAppointment,
    async markReminderSent(id) {
      const current = await deps.appointments.getAppointment(id);
      if (current === null) return { ok: false, reason: "Rendez-vous introuvable." };
      if (!isAppointmentEditable(current.status)) {
        return { ok: false, reason: "Ce rendez-vous est terminé ou annulé." };
      }
      const updated: AppointmentRecord = { ...current, reminder_sent_at: now(), updated_at: now() };
      await deps.appointments.saveAppointment(updated);
      await enqueue("UPDATE", APPOINTMENTS_ENTITY, updated.id, updated);
      return { ok: true, appointment: updated };
    },
    async transitionAppointment(id, to) {
      const item = await deps.appointments.getAppointment(id);
      if (item === null) {
        return { ok: false, reason: "Rendez-vous introuvable." };
      }
      if (!isAppointmentStatus(to) || !canTransitionAppointment(item.status, to)) {
        return {
          ok: false,
          reason: "Ce changement de statut est impossible.",
        };
      }
      const updated = appointmentAfterTransition(item, to, now());
      await deps.appointments.saveAppointment(updated);
      await enqueue("UPDATE", APPOINTMENTS_ENTITY, updated.id, updated);
      return { ok: true, appointment: updated };
    },
  };
}