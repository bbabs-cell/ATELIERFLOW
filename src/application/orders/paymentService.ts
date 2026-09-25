import { SyncEngine } from "@/application/sync/engine";
import { newIdempotencyKey } from "@/domain/ids/idempotency";
import {
  cancellationReasonValid,
  isPaymentCancellable,
  paymentBalance,
  validateNewPayment,
  type PaymentBalance,
  type PaymentMethod,
  type PaymentRecord,
} from "@/domain/orders/payments";
import type { OrdersRepository } from "@/repository/ports/orders";
import type { PaymentsRepository } from "@/repository/ports/payments";

const PAYMENTS = "payments";

export type RecordPaymentResult =
  | { ok: true; payment: PaymentRecord; balance: PaymentBalance }
  | { ok: false; errors: Record<string, string> };

export type CancelPaymentResult =
  | { ok: true; payment: PaymentRecord; balance: PaymentBalance }
  | { ok: false; reason: string };

export interface OrderPayments {
  order: {
    id: string;
    reference: string;
    status: string;
    total_price: number;
  };
  payments: PaymentRecord[];
  balance: PaymentBalance;
}

export interface PaymentService {
  recordPayment(input: {
    orderId: string;
    amount: number;
    method: PaymentMethod;
    note?: string | null;
  }): Promise<RecordPaymentResult>;
  cancelPayment(
    paymentId: string,
    reason: string,
  ): Promise<CancelPaymentResult>;
  orderPayments(orderId: string): Promise<OrderPayments | null>;
}

export interface PaymentServiceDeps {
  tenantId: string;
  profileId: string | null;
  orders: OrdersRepository;
  payments: PaymentsRepository;
  engine: SyncEngine;
  now?: () => string;
  uuid?: () => string;
}

export function createPaymentService(deps: PaymentServiceDeps): PaymentService {
  const now = deps.now ?? (() => new Date().toISOString());
  const port =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto
      : undefined;
  const uuid = deps.uuid ?? (() => port?.randomUUID() ?? newIdempotencyKey());

  async function balanceOf(
    orderTotal: number,
    orderId: string,
  ): Promise<PaymentBalance> {
    const payments = await deps.payments.listByOrder(orderId);
    return paymentBalance(orderTotal, payments);
  }

  async function enqueue(
    entityId: string,
    operation: "INSERT" | "UPDATE",
    payload: unknown,
  ) {
    await deps.engine.enqueue({
      tenantId: deps.tenantId,
      profileId: deps.profileId,
      entity: PAYMENTS,
      entityId,
      operation,
      payload,
    });
  }

  return {
    async recordPayment(input) {
      const validated = validateNewPayment(input);
      if (!validated.ok) {
        return {
          ok: false,
          errors: { ...validated.errors } as Record<string, string>,
        };
      }

      const order = await deps.orders.getOrder(validated.value.orderId);
      if (order === null) {
        return { ok: false, errors: { orderId: "Commande introuvable." } };
      }
      if (order.status === "CANCELLED") {
        return {
          ok: false,
          errors: { generic: "Impossible d'encaisser sur une commande annulée." },
        };
      }

      const txNow = now();
      const payment: PaymentRecord = {
        id: uuid(),
        tenant_id: deps.tenantId,
        order_id: order.id,
        amount: validated.value.amount,
        method: validated.value.method,
        status: "VALID",
        idempotency_key: uuid(),
        recorded_by: deps.profileId,
        note: validated.value.note ?? null,
        cancelled_by: null,
        cancelled_at: null,
        cancellation_reason: null,
        created_at: txNow,
        updated_at: txNow,
      };

      await deps.payments.savePayment(payment);
      await enqueue(payment.id, "INSERT", payment);

      const balance = await balanceOf(order.total_price, order.id);
      return { ok: true, payment, balance };
    },

    async cancelPayment(paymentId, reason) {
      const payment = await deps.payments.getPayment(paymentId);
      if (payment === null) {
        return { ok: false, reason: "Paiement introuvable." };
      }
      if (!isPaymentCancellable(payment)) {
        return { ok: false, reason: "Ce paiement est déjà annulé." };
      }
      if (!cancellationReasonValid(reason)) {
        return { ok: false, reason: "La raison d'annulation est obligatoire." };
      }

      const updated: PaymentRecord = {
        ...payment,
        status: "CANCELLED",
        cancelled_by: deps.profileId,
        cancelled_at: now(),
        cancellation_reason: reason.trim(),
        updated_at: now(),
      };
      await deps.payments.savePayment(updated);
      await enqueue(updated.id, "UPDATE", updated);

      const order = await deps.orders.getOrder(payment.order_id);
      const balance = order
        ? await balanceOf(order.total_price, order.id)
        : { total: 0, totalPaid: 0, remaining: 0, surplus: 0 };
      return { ok: true, payment: updated, balance };
    },

    async orderPayments(orderId) {
      const order = await deps.orders.getOrder(orderId);
      if (order === null) return null;
      const payments = await deps.payments.listByOrder(orderId);
      return {
        order: {
          id: order.id,
          reference: order.reference,
          status: order.status,
          total_price: order.total_price,
        },
        payments,
        balance: paymentBalance(order.total_price, payments),
      };
    },
  };
}