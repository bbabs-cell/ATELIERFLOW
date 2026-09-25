import type { AppointmentRecord } from "@/domain/appointments/appointments";
import type { NotificationRecord } from "@/domain/appointments/notifications";

export interface AppointmentsRepository {
  listAll(): Promise<AppointmentRecord[]>;
  listByCustomer(customerId: string): Promise<AppointmentRecord[]>;
  getAppointment(id: string): Promise<AppointmentRecord | null>;
  saveAppointment(record: AppointmentRecord): Promise<void>;
}

export interface NotificationsRepository {
  listAll(): Promise<NotificationRecord[]>;
  getNotification(id: string): Promise<NotificationRecord | null>;
  saveNotification(record: NotificationRecord): Promise<void>;
}