import type { AppointmentService } from "@/application/appointments/appointmentService";
import { createAppointmentService } from "@/application/appointments/appointmentService";
import type { NotificationService } from "@/application/appointments/notificationService";
import { createNotificationService } from "@/application/appointments/notificationService";
import { getClientsFacade } from "@/features/clients/facade";
import { makeLocalAppointmentsStores } from "@/repository/local/appointments";
import { makeLocalClientsStores } from "@/repository/local/clients";
import { createIndexedDbCache } from "@/repository/local/indexeddb/cache";
import {
  APPOINTMENTS_DEMO_PROFILE_ID,
  APPOINTMENTS_DEMO_TENANT_ID,
} from "./constants";

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

let singleton: AppointmentsFacade | null = null;

export function getAppointmentsFacade(): AppointmentsFacade {
  if (typeof window === "undefined") {
    throw new Error("APPOINTMENTS_FACADE_SERVER_SIDE");
  }
  if (singleton === null) {
    singleton = createAppointmentsFacade({
      tenantId: APPOINTMENTS_DEMO_TENANT_ID,
      profileId: APPOINTMENTS_DEMO_PROFILE_ID,
    });
  }
  return singleton;
}