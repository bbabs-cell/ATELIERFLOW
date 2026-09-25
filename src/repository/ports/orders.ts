import type {
  OrderItemRecord,
  OrderRecord,
  OrderStatus,
  OrderStatusHistoryRecord,
} from "@/domain/orders/order";

export interface OrdersRepository {
  listOrders(input: { status?: OrderStatus | null; includeArchive?: boolean }): Promise<OrderRecord[]>;
  getOrder(id: string): Promise<OrderRecord | null>;
  saveOrder(order: OrderRecord): Promise<void>;
}

export interface OrderItemsRepository {
  listByOrder(orderId: string): Promise<OrderItemRecord[]>;
  getItem(id: string): Promise<OrderItemRecord | null>;
  saveItem(item: OrderItemRecord): Promise<void>;
}

export interface OrderHistoryRepository {
  listByOrder(orderId: string): Promise<OrderStatusHistoryRecord[]>;
  saveEntry(entry: OrderStatusHistoryRecord): Promise<void>;
}