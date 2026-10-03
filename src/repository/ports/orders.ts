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
  /** Tous les articles en une lecture, regroupés par commande (même filtre et tri que listByOrder). */
  groupByOrder(): Promise<Map<string, OrderItemRecord[]>>;
  getItem(id: string): Promise<OrderItemRecord | null>;
  saveItem(item: OrderItemRecord): Promise<void>;
}

export interface OrderHistoryRepository {
  listByOrder(orderId: string): Promise<OrderStatusHistoryRecord[]>;
  /** Tout l'historique en une lecture, regroupé par commande (même tri que listByOrder). */
  groupByOrder(): Promise<Map<string, OrderStatusHistoryRecord[]>>;
  saveEntry(entry: OrderStatusHistoryRecord): Promise<void>;
}