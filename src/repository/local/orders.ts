import type {
  OrderItemRecord,
  OrderRecord,
  OrderStatusHistoryRecord,
} from "@/domain/orders/order";
import type { LocalCachePort } from "@/repository/ports/sync";
import type {
  OrderHistoryRepository,
  OrderItemsRepository,
  OrdersRepository,
} from "@/repository/ports/orders";

const ORDERS = "orders";
const ORDER_ITEMS = "order_items";
const ORDER_HISTORY = "order_status_history";

function asEntity<T>(records: unknown[]): T[] {
  return records as T[];
}

function groupBy<T extends { order_id: string }>(records: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const record of records) {
    const group = groups.get(record.order_id);
    if (group) group.push(record);
    else groups.set(record.order_id, [record]);
  }
  return groups;
}

const byItemOrder = (a: OrderItemRecord, b: OrderItemRecord) => a.sort_order - b.sort_order;
const byNewest = (a: OrderStatusHistoryRecord, b: OrderStatusHistoryRecord) =>
  b.created_at.localeCompare(a.created_at);

export function makeLocalOrdersRepository(cache: LocalCachePort): OrdersRepository {
  async function listOrders(): Promise<OrderRecord[]> {
    const records = asEntity<OrderRecord>(await cache.list(ORDERS));
    return records.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async function getOrder(id: string): Promise<OrderRecord | null> {
    return (await cache.get(ORDERS, id)) as OrderRecord | null;
  }

  async function saveOrder(order: OrderRecord): Promise<void> {
    await cache.put(ORDERS, order.id, order);
  }

  return { listOrders, getOrder, saveOrder };
}

export function makeLocalOrderItemsRepository(
  cache: LocalCachePort,
): OrderItemsRepository {
  async function activeItems(): Promise<OrderItemRecord[]> {
    const records = asEntity<OrderItemRecord>(await cache.list(ORDER_ITEMS));
    return records.filter((i) => i.deleted_at === null);
  }

  async function listByOrder(orderId: string): Promise<OrderItemRecord[]> {
    return (await activeItems()).filter((i) => i.order_id === orderId).sort(byItemOrder);
  }

  async function groupByOrder(): Promise<Map<string, OrderItemRecord[]>> {
    const groups = groupBy(await activeItems());
    for (const group of groups.values()) group.sort(byItemOrder);
    return groups;
  }

  async function getItem(id: string): Promise<OrderItemRecord | null> {
    return (await cache.get(ORDER_ITEMS, id)) as OrderItemRecord | null;
  }

  async function saveItem(item: OrderItemRecord): Promise<void> {
    await cache.put(ORDER_ITEMS, item.id, item);
  }

  return { listByOrder, groupByOrder, getItem, saveItem };
}

export function makeLocalOrderHistoryRepository(
  cache: LocalCachePort,
): OrderHistoryRepository {
  async function listByOrder(orderId: string): Promise<OrderStatusHistoryRecord[]> {
    const records = asEntity<OrderStatusHistoryRecord>(await cache.list(ORDER_HISTORY));
    return records.filter((h) => h.order_id === orderId).sort(byNewest);
  }

  async function groupByOrder(): Promise<Map<string, OrderStatusHistoryRecord[]>> {
    const groups = groupBy(asEntity<OrderStatusHistoryRecord>(await cache.list(ORDER_HISTORY)));
    for (const group of groups.values()) group.sort(byNewest);
    return groups;
  }

  async function saveEntry(entry: OrderStatusHistoryRecord): Promise<void> {
    await cache.put(ORDER_HISTORY, entry.id, entry);
  }

  return { listByOrder, groupByOrder, saveEntry };
}

export function makeLocalOrderStores(cache: LocalCachePort): {
  orders: OrdersRepository;
  items: OrderItemsRepository;
  history: OrderHistoryRepository;
} {
  return {
    orders: makeLocalOrdersRepository(cache),
    items: makeLocalOrderItemsRepository(cache),
    history: makeLocalOrderHistoryRepository(cache),
  };
}