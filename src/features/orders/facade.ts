import type { OrderService } from "@/application/orders/orderService";
import { createOrderService } from "@/application/orders/orderService";
import type { PaymentService } from "@/application/orders/paymentService";
import { createPaymentService } from "@/application/orders/paymentService";
import type { ReceiptService } from "@/application/orders/receiptService";
import { createReceiptService } from "@/application/orders/receiptService";
import { getClientsFacade } from "@/features/clients/facade";
import { makeLocalClientsStores } from "@/repository/local/clients";
import {
  makeLocalOrdersRepository,
  makeLocalOrderStores,
} from "@/repository/local/orders";
import { makeLocalPaymentsRepository } from "@/repository/local/payments";
import { makeLocalReceiptsRepository } from "@/repository/local/receipts";
import { createIndexedDbCache } from "@/repository/local/indexeddb/cache";
import { scopedToSession } from "@/application/auth/session";

export interface OrdersFacade {
  orders: OrderService;
  payments: PaymentService;
  receipts: ReceiptService;
}

export function createOrdersFacade(input: {
  tenantId: string;
  profileId: string | null;
}): OrdersFacade {
  const clientsFacade = getClientsFacade();
  const cache = createIndexedDbCache(input.tenantId);
  const stores = makeLocalOrderStores(cache);
  const customers = makeLocalClientsStores(cache).customers;

  const orders = createOrderService({
    tenantId: input.tenantId,
    profileId: input.profileId,
    orders: stores.orders,
    items: stores.items,
    history: stores.history,
    customers,
    engine: clientsFacade.engine,
  });

  const payments = createPaymentService({
    tenantId: input.tenantId,
    profileId: input.profileId,
    orders: makeLocalOrdersRepository(cache),
    payments: makeLocalPaymentsRepository(cache),
    engine: clientsFacade.engine,
  });

  const receipts = createReceiptService({
    tenantId: input.tenantId,
    profileId: input.profileId,
    orders: makeLocalOrdersRepository(cache),
    payments: makeLocalPaymentsRepository(cache),
    receipts: makeLocalReceiptsRepository(cache),
    engine: clientsFacade.engine,
  });

  return { orders, payments, receipts };
}

const scopedOrdersFacade = scopedToSession((session) =>
  createOrdersFacade({ tenantId: session.tenantId, profileId: session.profileId }),
);

export function getOrdersFacade(): OrdersFacade {
  if (typeof window === "undefined") {
    throw new Error("ORDERS_FACADE_SERVER_SIDE");
  }
  return scopedOrdersFacade();
}
