import { SyncEngine } from "@/application/sync/engine";
import { newIdempotencyKey } from "@/domain/ids/idempotency";
import {
  APPOINTMENT_TYPE_LABELS,
  appointmentAfterTransition,
  canTransitionAppointment,
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
import { APPOINTMENT_REMINDER_TYPE } from "@/domain/appointments/notifications";
import type { Customer } from "@/domain/clients/customer";
import type {
  AppointmentsRepository,
  NotificationsRepository,
} from "@/repository/ports/appointments";
import type { CustomersRepository } from "@/repository/ports/clients";

const APPOINTMENTS_ENTITY = "appointments";
const NOTIFICATIONS_ENTITY = "notifications";

export interface AppointmentListItem {
  appointment: AppointmentRecord;
  customer: Customer | null;
}

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
}

export interface AppointmentServiceDeps {
  tenantId: string;
  profileId: string | null;
  appointments: AppointmentsRepository;
  notifications: NotificationsRepository;
  customers: CustomersRepository;
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

  async function buildReminder(
    appointment: AppointmentRecord,
    customer: Customer,
  ) {
    if (customer.whatsapp === null) return;
    const type = APPOINTMENT_TYPE_LABELS[appointment.type as AppointmentType];
    const starts = new Date(appointment.starts_at);
    const label = starts.toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    const time = `${String(starts.getHours()).padStart(2, "0")}:${String(
      starts.getMinutes(),
    ).padStart(2, "0")}`;
    return {
      id: uuid(),
      tenant_id: deps.tenantId,
      recipient_profile_id: deps.profileId ?? "",
      type: APPOINTMENT_REMINDER_TYPE,
      channel: "WHATSAPP" as const,
      title: "Rappel de rendez-vous",
      body: `Bonjour ${customer.full_name}, ${type} à l'atelier le ${label} à ${time}.`,
      payload: {
        appointment_id: appointment.id,
        customer_id: customer.id,
        starts_at: appointment.starts_at,
        type: appointment.type,
        whatsapp: customer.whatsapp,
      },
      read_at: null,
      sent_at: null,
      created_at: now(),
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
      created_by: deps.profileId,
      created_at: now(),
      updated_at: now(),
      deleted_at: null,
    };

    await deps.appointments.saveAppointment(appointment);
    await enqueue("INSERT", APPOINTMENTS_ENTITY, appointment.id, appointment);

    const reminder = await buildReminder(appointment, customer);
    if (reminder !== undefined) {
      await deps.notifications.saveNotification(reminder);
      await enqueue("INSERT", NOTIFICATIONS_ENTITY, reminder.id, reminder);
    }

    return { ok: true as const, appointment };
  }

  return {
    async listAppointments() {
      const records = await deps.appointments.listAll();
      const items: AppointmentListItem[] = [];
      for (const appointment of records) {
        items.push({
          appointment,
          customer: await deps.customers.getCustomer(appointment.customer_id),
        });
      }
      return items;
    },
    async getAppointment(id) {
      const appointment = await deps.appointments.getAppointment(id);
      if (appointment === null) return null;
      return {
        appointment,
        customer: await deps.customers.getCustomer(appointment.customer_id),
      };
    },
    createAppointment,
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