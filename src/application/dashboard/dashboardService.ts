import type {
  AppointmentsRepository,
} from "@/repository/ports/appointments";
import type { FabricsRepository, StockMovementsRepository } from "@/repository/ports/inventory";
import type { OrdersRepository } from "@/repository/ports/orders";
import type { PaymentsRepository } from "@/repository/ports/payments";
import type { CustomersRepository } from "@/repository/ports/clients";
import type { Customer } from "@/domain/clients/customer";
import type { OrderRecord } from "@/domain/orders/order";
import type { PaymentRecord } from "@/domain/orders/payments";
import type { AppointmentRecord } from "@/domain/appointments/appointments";
import type { FabricRecord } from "@/domain/inventory/fabrics";
import type { TeamMembersRepository } from "@/repository/ports/team";
import { can, permissionsFor } from "@/domain/team/roles";
import type { PermissionCode, TenantRoleCode } from "@/domain/team/roles";
import {
  aggregateDashboardKpis,
  defaultDateRange,
} from "@/domain/dashboard/kpis";
import type { DateRange, DashboardKpis } from "@/domain/dashboard/kpis";
import {
  buildAppointmentHits,
  buildCustomerHits,
  buildFabricHits,
  buildMemberHits,
  buildOrderHits,
  normalizeSearchTerm,
} from "@/domain/dashboard/search";
import type { SearchHit } from "@/domain/dashboard/search";

export interface DashboardServiceDeps {
  tenantId: string;
  profileId: string;
  customers: CustomersRepository;
  orders: OrdersRepository;
  payments: PaymentsRepository;
  fabrics: FabricsRepository;
  movements: StockMovementsRepository;
  appointments: AppointmentsRepository;
  team: TeamMembersRepository;
  now?: () => string;
}

export interface DashboardAccess {
  role: TenantRoleCode;
  permissions: PermissionCode[];
  canRead: (permission: PermissionCode) => boolean;
}

export type DashboardResult =
  | { ok: true; kpis: DashboardKpis; range: DateRange }
  | { ok: false; reason: string };

/** Données brutes du rapport mensuel (calculé sur l'appareil). */
export type ReportSourcesResult =
  | { ok: true; orders: OrderRecord[]; payments: PaymentRecord[]; customers: Customer[] }
  | { ok: false; reason: string };

/** Données lisibles par l'assistant, limitées aux droits du rôle. */
export interface AssistantSources {
  permissions: PermissionCode[];
  orders: OrderRecord[];
  payments: PaymentRecord[];
  customers: Customer[];
  appointments: AppointmentRecord[];
  fabrics: FabricRecord[];
}

export interface DashboardService {
  getAccess(): Promise<DashboardAccess>;
  getAssistantSources(): Promise<AssistantSources>;
  getReportSources(): Promise<ReportSourcesResult>;
  getKpis(range?: DateRange): Promise<DashboardResult>;
  search(term: string): Promise<SearchHit[]>;
}

export function createDashboardService(deps: DashboardServiceDeps): DashboardService {
  const nowFn = deps.now ?? (() => new Date().toISOString());

  async function getAccess(): Promise<DashboardAccess> {
    const me = await deps.team.getMember(deps.profileId);
    const role: TenantRoleCode = me === null ? "OWNER" : me.role;
    const permissions = permissionsFor(role);
    return { role, permissions, canRead: (p) => can(role, p) };
  }

  async function loadKpis(range?: DateRange): Promise<{
    kpis: DashboardKpis;
    range: DateRange;
  }> {
    const [customers, orders, payments, fabrics, movements, appointments, team] =
      await Promise.all([
        deps.customers.list("", false),
        deps.orders.listOrders({ includeArchive: false }),
        deps.payments.listAll(),
        deps.fabrics.listAll(),
        deps.movements.listAll(),
        deps.appointments.listAll(),
        deps.team.listAll(),
      ]);
    const now = nowFn();
    const resolvedRange = range ?? defaultDateRange(now);
    const kpis = aggregateDashboardKpis({
      customers,
      orders,
      payments,
      fabrics,
      movements,
      appointments,
      team,
      range: resolvedRange,
      today: now.slice(0, 10),
    });
    return { kpis, range: resolvedRange };
  }

  return {
    async getAccess() {
      return getAccess();
    },
    async getAssistantSources() {
      const access = await getAccess();
      const read = access.canRead;
      const [orders, payments, customers, appointments, fabrics] = await Promise.all([
        read("orders.read") ? deps.orders.listOrders({ includeArchive: true }) : [],
        read("payments.read") ? deps.payments.listAll() : [],
        read("customers.read") ? deps.customers.list("", true) : [],
        read("appointments.read") ? deps.appointments.listAll() : [],
        read("stock.read") || read("fabrics.read") ? deps.fabrics.listAll() : [],
      ]);
      return { permissions: access.permissions, orders, payments, customers, appointments, fabrics };
    },
    async getReportSources() {
      const access = await getAccess();
      if (!access.canRead("reports.read")) return { ok: false, reason: "FORBIDDEN" };
      const [orders, payments, customers] = await Promise.all([
        deps.orders.listOrders({ includeArchive: true }),
        deps.payments.listAll(),
        deps.customers.list("", true),
      ]);
      return { ok: true, orders, payments, customers };
    },
    async getKpis(range) {
      const access = await getAccess();
      if (!access.canRead("reports.read")) {
        return { ok: false, reason: "FORBIDDEN" };
      }
      const result = await loadKpis(range);
      return { ok: true, ...result };
    },
    async search(term) {
      const access = await getAccess();
      const normalized = normalizeSearchTerm(term);
      if (normalized.length < 2) return [];

      const [customers, orders, fabrics, appointments, team] = await Promise.all([
        access.canRead("customers.read") ? deps.customers.list("", false) : [],
        access.canRead("orders.read") ? deps.orders.listOrders({ includeArchive: false }) : [],
        access.canRead("fabrics.read") ? deps.fabrics.listAll() : [],
        access.canRead("appointments.read") ? deps.appointments.listAll() : [],
        access.canRead("team.read") ? deps.team.listAll() : [],
      ]);

      const hits: SearchHit[] = [
        ...buildCustomerHits(normalized, customers),
        ...buildOrderHits(normalized, orders),
        ...buildFabricHits(normalized, fabrics),
        ...buildAppointmentHits(normalized, appointments, customers),
        ...buildMemberHits(normalized, team),
      ];
      return hits.slice(0, 12);
    },
  };
}