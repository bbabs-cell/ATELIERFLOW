import type { DashboardService } from "@/application/dashboard/dashboardService";
import { createDashboardService } from "@/application/dashboard/dashboardService";
import { makeLocalAppointmentsStores } from "@/repository/local/appointments";
import { makeLocalClientsStores } from "@/repository/local/clients";
import { createIndexedDbCache } from "@/repository/local/indexeddb/cache";
import { makeLocalInventoryStores } from "@/repository/local/inventory";
import { makeLocalOrderStores } from "@/repository/local/orders";
import { makeLocalPaymentsRepository } from "@/repository/local/payments";
import { makeLocalTeamRepository } from "@/repository/local/team";
import { ORDERS_DEMO_PROFILE_ID, ORDERS_DEMO_TENANT_ID } from "@/features/orders/constants";

export interface DashboardFacade {
  dashboard: DashboardService;
}

export function createDashboardFacade(input: {
  tenantId: string;
  profileId: string;
}): DashboardFacade {
  const cache = createIndexedDbCache(input.tenantId);
  const clients = makeLocalClientsStores(cache);
  const orders = makeLocalOrderStores(cache);
  const inventory = makeLocalInventoryStores(cache);
  const appointments = makeLocalAppointmentsStores(cache);

  const dashboard = createDashboardService({
    tenantId: input.tenantId,
    profileId: input.profileId,
    customers: clients.customers,
    orders: orders.orders,
    payments: makeLocalPaymentsRepository(cache),
    fabrics: inventory.fabrics,
    movements: inventory.movements,
    appointments: appointments.appointments,
    team: makeLocalTeamRepository(cache),
  });

  return { dashboard };
}

let singleton: DashboardFacade | null = null;

export function getDashboardFacade(): DashboardFacade {
  if (typeof window === "undefined") {
    throw new Error("DASHBOARD_FACADE_SERVER_SIDE");
  }
  if (singleton === null) {
    singleton = createDashboardFacade({
      tenantId: ORDERS_DEMO_TENANT_ID,
      profileId: ORDERS_DEMO_PROFILE_ID,
    });
  }
  return singleton;
}