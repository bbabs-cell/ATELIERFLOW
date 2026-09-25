import type { AppointmentService } from "@/application/appointments/appointmentService";
import { createAppointmentService } from "@/application/appointments/appointmentService";
import type { NotificationService } from "@/application/appointments/notificationService";
import { createNotificationService } from "@/application/appointments/notificationService";
import { getClientsFacade } from "@/features/clients/facade";
import { makeLocalAppointmentsStores } from "@/repository/local/appointments";
import { makeLocalClientsStores } from "@/repository/local/clients";
import { createIndexedDbCache } from "@/repository/local/indexeddb/cache";
import { scopedToSession } from "@/application/auth/session";

export interface AppointmentsFacade {
  appointments: AppointmentService;
  notifications: NotificationService;
}

export function createAppointmentsFacade(input: {
  tenantId: string;
  profileId: string | null;
}): AppointmentsFacade {
  const clientsFacade = getClientsFacade();
  const cache = createIndexedDbCache(input.tenantId);
  const stores = makeLocalAppointmentsStores(cache);
  const customers = makeLocalClientsStores(cache).customers;

  const appointments = createAppointmentService({
    tenantId: input.tenantId,
    profileId: input.profileId,
    appointments: stores.appointments,
    notifications: stores.notifications,
    customers,
    engine: clientsFacade.engine,
  });

  const notifications = createNotificationService({
    tenantId: input.tenantId,
    profileId: input.profileId,
    notifications: stores.notifications,
    engine: clientsFacade.engine,
  });

  return { appointments, notifications };
}

const scopedAppointmentsFacade = scopedToSession((session) =>
  createAppointmentsFacade({ tenantId: session.tenantId, profileId: session.profileId }),
);

export function getAppointmentsFacade(): AppointmentsFacade {
  if (typeof window === "undefined") {
    throw new Error("APPOINTMENTS_FACADE_SERVER_SIDE");
  }
  return scopedAppointmentsFacade();
}
