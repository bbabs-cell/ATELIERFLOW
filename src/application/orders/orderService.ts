import { SyncEngine } from "@/application/sync/engine";
import { newIdempotencyKey } from "@/domain/ids/idempotency";
import { lineTotal, sumAmounts } from "@/domain/money";
import {
  isOrderReference,
  newOrderReference,
  nextOrderSequence,
  orderAfterTransition,
  transitionOrder,
  validateOrderItemDraft,
  type OrderItemDraft,
  type OrderItemRecord,
  type OrderRecord,
  type OrderStatus,
  type OrderStatusHistoryRecord,
} from "@/domain/orders/order";
import type { CustomersRepository } from "@/repository/ports/clients";
import type {
  OrderHistoryRepository,
  OrderItemsRepository,
  OrdersRepository,
} from "@/repository/ports/orders";

export type CreateOrderResult =
  | { ok: true; order: OrderRecord; items: OrderItemRecord[] }
  | { ok: false; errors: Record<string, string> };

export interface OrderWithCustomer {
  order: OrderRecord;
  customerName: string | null;
  items: OrderItemRecord[];
  history: OrderStatusHistoryRecord[];
}

export interface OrderService {
  listOrders(input?: {
    search?: string;
    status?: OrderStatus | null;
    includeArchive?: boolean;
  }): Promise<OrderWithCustomer[]>;
  getOrderDetail(id: string): Promise<OrderWithCustomer | null>;
  createOrder(input: {
    customerId: string;
    priority: OrderRecord["priority"];
    expectedAt?: string | null;
    notes?: string | null;
    items: OrderItemDraft[];
  }): Promise<CreateOrderResult>;
  updateHeader(
    id: string,
    input: {
      priority: OrderRecord["priority"];
      expectedAt?: string | null;
      notes?: string | null;
    },
  ): Promise<OrderRecord | null>;
  transition(
    id: string,
    to: OrderStatus,
    note?: string | null,
  ): Promise<{ ok: true; order: OrderRecord } | { ok: false; reason: string }>;
  cancel(
    id: string,
    reason: string,
  ): Promise<{ ok: true; order: OrderRecord } | { ok: false; reason: string }>;
  /** Affecte la commande à un membre (profil) ou retire l'affectation (null). */
  assign(id: string, employeeId: string | null): Promise<OrderRecord | null>;
}

export interface OrderServiceDeps {
  tenantId: string;
  profileId: string | null;
  orders: OrdersRepository;
  items: OrderItemsRepository;
  history: OrderHistoryRepository;
  customers: CustomersRepository;
  engine: SyncEngine;
  now?: () => string;
  uuid?: () => string;
}

const ORDERS = "orders";
const ORDER_ITEMS = "order_items";
const ORDER_HISTORY = "order_status_history";

export function createOrderService(deps: OrderServiceDeps): OrderService {
  const now = deps.now ?? (() => new Date().toISOString());
  const port =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto
      : undefined;
  const uuid = deps.uuid ?? (() => port?.randomUUID() ?? newIdempotencyKey());

  const customerNames = new Map<string, string>();

  async function refreshCustomerNames(): Promise<void> {
    const customers = await deps.customers.list("", true);
    customerNames.clear();
    for (const customer of customers) {
      customerNames.set(customer.id, customer.full_name);
    }
  }

  async function nameOf(customerId: string): Promise<string | null> {
    // Client créé depuis le dernier chargement (saisi avec la commande,
    // autre écran) : la liste en mémoire est relue avant de conclure.
    if (!customerNames.has(customerId)) await refreshCustomerNames();
    return customerNames.get(customerId) ?? null;
  }

  async function buildItems(
    orderId: string,
    drafts: OrderItemDraft[],
    txNow: string,
  ): Promise<OrderItemRecord[]> {
    return drafts.map((draft, index) => ({
      id: uuid(),
      order_id: orderId,
      tenant_id: deps.tenantId,
      description: draft.description.trim(),
      garment_type: draft.garment_type?.trim() || null,
      measurement_profile_id: draft.measurement_profile_id ?? null,
      fabric_id: draft.fabric_id ?? null,
      fabric_meters: draft.fabric_meters ?? null,
      quantity: draft.quantity,
      unit_price: draft.unit_price,
      notes: draft.notes ?? null,
      sort_order: index,
      created_at: txNow,
      updated_at: txNow,
      deleted_at: null,
    }));
  }

  async function enqueue(entity: string, entityId: string, operation: "INSERT" | "UPDATE", payload: unknown) {
    await deps.engine.enqueue({
      tenantId: deps.tenantId,
      profileId: deps.profileId,
      entity,
      entityId,
      operation,
      payload,
    });
  }

  /**
   * Charge utile d'une modification qui ne touche pas à l'affectation :
   * sans employee_id, pour ne jamais écraser côté serveur une affectation
   * faite depuis un autre appareil (0018 : la clé présente fait foi).
   */
  function withoutAssignment(order: OrderRecord): Omit<OrderRecord, "employee_id"> {
    const { employee_id: _ignored, ...rest } = order;
    void _ignored;
    return rest;
  }

  async function doTransition(
    id: string,
    to: OrderStatus,
    note: string | null,
  ): Promise<{ ok: true; order: OrderRecord } | { ok: false; reason: string }> {
    const order = await deps.orders.getOrder(id);
    if (order === null) return { ok: false, reason: "Commande introuvable." };
    const txNow = now();
    const result = transitionOrder(order, to, {
      changedBy: deps.profileId,
      note: note?.trim() || null,
      now: txNow,
      historyId: uuid(),
    });
    if (!result.ok) return { ok: false, reason: result.reason };

    const updated = orderAfterTransition(order, to, txNow);
    await deps.orders.saveOrder(updated);
    await deps.history.saveEntry(result.result.history);
    await enqueue(ORDERS, id, "UPDATE", withoutAssignment(updated));
    await enqueue(ORDER_HISTORY, result.result.history.id, "INSERT", result.result.history);
    return { ok: true, order: updated };
  }

  return {
    async listOrders(input = {}) {
      // Une lecture par type de données, puis regroupement en mémoire :
      // jamais une lecture par commande (coût quadratique sur un gros atelier).
      const [orders, customers, itemsByOrder, historyByOrder] = await Promise.all([
        deps.orders.listOrders({}),
        deps.customers.list("", true),
        deps.items.groupByOrder(),
        deps.history.groupByOrder(),
      ]);
      customerNames.clear();
      for (const customer of customers) customerNames.set(customer.id, customer.full_name);

      const q = (input.search ?? "").trim().toLowerCase();
      const rows: OrderWithCustomer[] = [];
      for (const order of orders) {
        if (input.status && order.status !== input.status) continue;
        if (!(input.includeArchive ?? false) && order.status === "CANCELLED") continue;
        if (q.length > 0) {
          const hay = `${order.reference} ${customerNames.get(order.customer_id) ?? ""}`.toLowerCase();
          if (!hay.includes(q)) continue;
        }
        rows.push({
          order,
          customerName: customerNames.get(order.customer_id) ?? null,
          items: itemsByOrder.get(order.id) ?? [],
          history: historyByOrder.get(order.id) ?? [],
        });
      }
      return rows;
    },

    async getOrderDetail(id) {
      const order = await deps.orders.getOrder(id);
      if (order === null) return null;
      await nameOf(order.customer_id);
      const [items, history] = await Promise.all([
        deps.items.listByOrder(id),
        deps.history.listByOrder(id),
      ]);
      return { order, customerName: customerNames.get(order.customer_id) ?? null, items, history };
    },

    async createOrder(input) {
      const errors: Record<string, string> = {};
      let hasItemError = false;

      if (!input.customerId) {
        errors.customerId = "Sélectionnez un client.";
      }
      const drafts: OrderItemDraft[] = [];
      input.items.forEach((draft, index) => {
        const result = validateOrderItemDraft(draft);
        if (!result.ok) {
          hasItemError = true;
          for (const [key, message] of Object.entries(result.errors)) {
            errors[`items.${index}.${key}`] = message;
          }
          return;
        }
        drafts.push(result.value);
      });
      if (input.items.length === 0) {
        errors.generic = "Ajoutez au moins un article à la commande.";
      }

      if (input.customerId) {
        const customerName = await nameOf(input.customerId);
        if (customerName === null) {
          errors.customerId = "Client introuvable.";
        }
      }

      if (drafts.length > 0 && !hasItemError) {
        const totals = drafts.map((d) => lineTotal({ quantity: d.quantity, unitPrice: d.unit_price }));
        const total = sumAmounts(totals as number[]);
        if (total === null && drafts.length > 0) {
          errors.total = "Montant de la commande invalide.";
        }
        if (Object.keys(errors).length === 0 && total !== null) {
          const existing = await deps.orders.listOrders({});
          const refs = existing.map((o) => o.reference).filter(isOrderReference);
          const year = new Date(now()).getFullYear();
          const seq = nextOrderSequence(year, refs);
          const reference = newOrderReference(year, seq);
          const txNow = now();

          const order: OrderRecord = {
            id: uuid(),
            tenant_id: deps.tenantId,
            customer_id: input.customerId,
            reference,
            status: "REGISTERED",
            priority: input.priority,
            total_price: total,
            expected_at: input.expectedAt ?? null,
            delivered_at: null,
            employee_id: null,
            notes: input.notes ?? null,
            created_by: deps.profileId,
            created_at: txNow,
            updated_at: txNow,
            deleted_at: null,
          };
          const items = await buildItems(order.id, drafts, txNow);

          await deps.orders.saveOrder(order);
          await enqueue(ORDERS, order.id, "INSERT", order);
          for (const item of items) {
            await deps.items.saveItem(item);
            await enqueue(ORDER_ITEMS, item.id, "INSERT", item);
          }
          const initialEntry: OrderStatusHistoryRecord = {
            id: uuid(),
            order_id: order.id,
            tenant_id: deps.tenantId,
            from_status: null,
            to_status: "REGISTERED",
            changed_by: deps.profileId,
            note: "Commande créée.",
            created_at: txNow,
          };
          await deps.history.saveEntry(initialEntry);
          await enqueue(ORDER_HISTORY, initialEntry.id, "INSERT", initialEntry);

          return { ok: true, order, items };
        }
      }

      return { ok: false, errors };
    },

    async updateHeader(id, input) {
      const existing = await deps.orders.getOrder(id);
      if (existing === null) return null;
      const order: OrderRecord = {
        ...existing,
        priority: input.priority,
        expected_at: input.expectedAt ?? null,
        notes: input.notes ?? null,
        updated_at: now(),
      };
      await deps.orders.saveOrder(order);
      await enqueue(ORDERS, id, "UPDATE", withoutAssignment(order));
      return order;
    },

    async transition(id, to, note) {
      return doTransition(id, to, note ?? null);
    },

    async assign(id, employeeId) {
      const existing = await deps.orders.getOrder(id);
      if (existing === null) return null;
      if (existing.employee_id === employeeId) return existing;
      const order: OrderRecord = { ...existing, employee_id: employeeId, updated_at: now() };
      await deps.orders.saveOrder(order);
      await enqueue(ORDERS, id, "UPDATE", order);
      return order;
    },

    async cancel(id, reason) {
      const trimmed = reason?.trim() ?? "";
      if (trimmed.length === 0) {
        return { ok: false, reason: "La raison d'annulation est obligatoire." };
      }
      return doTransition(id, "CANCELLED", trimmed);
    },
  };
}