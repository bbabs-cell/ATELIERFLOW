import type { AppointmentRecord } from "@/domain/appointments/appointments";
import type { NotificationRecord } from "@/domain/appointments/notifications";
import type { LocalCachePort } from "@/repository/ports/sync";
import type {
  AppointmentsRepository,
  NotificationsRepository,
} from "@/repository/ports/appointments";

const APPOINTMENTS_ENTITY = "appointments";
const NOTIFICATIONS_ENTITY = "notifications";

function asEntity<T>(records: unknown[]): T[] {
  return records as T[];
}

export function makeLocalAppointmentsRepository(
  cache: LocalCachePort,
): AppointmentsRepository {
  async function listAll(): Promise<AppointmentRecord[]> {
    const records = asEntity<AppointmentRecord>(await cache.list(APPOINTMENTS_ENTITY));
    return records.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  }

  async function listByCustomer(customerId: string): Promise<AppointmentRecord[]> {
    const records = asEntity<AppointmentRecord>(await cache.list(APPOINTMENTS_ENTITY));
    return records
      .filter((a) => a.customer_id === customerId)
      .sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  }

  async function getAppointment(id: string): Promise<AppointmentRecord | null> {
    return (await cache.get(APPOINTMENTS_ENTITY, id)) as AppointmentRecord | null;
  }

  async function saveAppointment(record: AppointmentRecord): Promise<void> {
    await cache.put(APPOINTMENTS_ENTITY, record.id, record);
  }

  return { listAll, listByCustomer, getAppointment, saveAppointment };
}

export function makeLocalNotificationsRepository(
  cache: LocalCachePort,
): NotificationsRepository {
  async function listAll(): Promise<NotificationRecord[]> {
    const records = asEntity<NotificationRecord>(await cache.list(NOTIFICATIONS_ENTITY));
    return records.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async function getNotification(id: string): Promise<NotificationRecord | null> {
    return (await cache.get(NOTIFICATIONS_ENTITY, id)) as NotificationRecord | null;
  }

  async function saveNotification(record: NotificationRecord): Promise<void> {
    await cache.put(NOTIFICATIONS_ENTITY, record.id, record);
  }

  return { listAll, getNotification, saveNotification };
}

export function makeLocalAppointmentsStores(cache: LocalCachePort): {
  appointments: AppointmentsRepository;
  notifications: NotificationsRepository;
} {
  return {
    appointments: makeLocalAppointmentsRepository(cache),
    notifications: makeLocalNotificationsRepository(cache),
  };
}