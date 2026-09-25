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
  async function listByOrder(orderId: string): Promise<OrderItemRecord[]> {
    const records = asEntity<OrderItemRecord>(await cache.list(ORDER_ITEMS));
    return records
      .filter((i) => i.order_id === orderId && i.deleted_at === null)
      .sort((a, b) => a.sort_order - b.sort_order);
  }

  async function getItem(id: string): Promise<OrderItemRecord | null> {
    return (await cache.get(ORDER_ITEMS, id)) as OrderItemRecord | null;
  }

  async function saveItem(item: OrderItemRecord): Promise<void> {
    await cache.put(ORDER_ITEMS, item.id, item);
  }

  return { listByOrder, getItem, saveItem };
}

export function makeLocalOrderHistoryRepository(
  cache: LocalCachePort,
): OrderHistoryRepository {
  async function listByOrder(orderId: string): Promise<OrderStatusHistoryRecord[]> {
    const records = asEntity<OrderStatusHistoryRecord>(await cache.list(ORDER_HISTORY));
    return records
      .filter((h) => h.order_id === orderId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async function saveEntry(entry: OrderStatusHistoryRecord): Promise<void> {
    await cache.put(ORDER_HISTORY, entry.id, entry);
  }

  return { listByOrder, saveEntry };
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