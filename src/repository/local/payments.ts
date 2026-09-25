import type { PaymentRecord } from "@/domain/orders/payments";
import type { LocalCachePort } from "@/repository/ports/sync";
import type { PaymentsRepository } from "@/repository/ports/payments";

const PAYMENTS = "payments";

function asEntity<T>(records: unknown[]): T[] {
  return records as T[];
}

export function makeLocalPaymentsRepository(
  cache: LocalCachePort,
): PaymentsRepository {
  async function listAll(): Promise<PaymentRecord[]> {
    const records = asEntity<PaymentRecord>(await cache.list(PAYMENTS));
    return records.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  async function listByOrder(orderId: string): Promise<PaymentRecord[]> {
    const records = asEntity<PaymentRecord>(await cache.list(PAYMENTS));
    return records
      .filter((p) => p.order_id === orderId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  async function getPayment(id: string): Promise<PaymentRecord | null> {
    return (await cache.get(PAYMENTS, id)) as PaymentRecord | null;
  }

  async function savePayment(payment: PaymentRecord): Promise<void> {
    await cache.put(PAYMENTS, payment.id, payment);
  }

  return { listAll, listByOrder, getPayment, savePayment };
}