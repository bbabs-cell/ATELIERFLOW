import type { ReceiptRecord } from "@/domain/orders/receipts";
import type { LocalCachePort } from "@/repository/ports/sync";
import type { ReceiptsRepository } from "@/repository/ports/receipts";

const RECEIPTS = "receipts";

function asEntity<T>(records: unknown[]): T[] {
  return records as T[];
}

export function makeLocalReceiptsRepository(
  cache: LocalCachePort,
): ReceiptsRepository {
  async function listAll(): Promise<ReceiptRecord[]> {
    return asEntity<ReceiptRecord>(await cache.list(RECEIPTS));
  }

  async function listByOrder(orderId: string): Promise<ReceiptRecord[]> {
    const records = asEntity<ReceiptRecord>(await cache.list(RECEIPTS));
    return records
      .filter((r) => r.order_id === orderId)
      .sort((a, b) => a.issued_at.localeCompare(b.issued_at));
  }

  async function listByPayment(paymentId: string): Promise<ReceiptRecord[]> {
    const records = asEntity<ReceiptRecord>(await cache.list(RECEIPTS));
    return records.filter((r) => r.payment_id === paymentId);
  }

  async function getReceipt(id: string): Promise<ReceiptRecord | null> {
    return (await cache.get(RECEIPTS, id)) as ReceiptRecord | null;
  }

  async function saveReceipt(receipt: ReceiptRecord): Promise<void> {
    const existing = (await cache.get(RECEIPTS, receipt.id)) as
      | ReceiptRecord
      | null;
    if (existing !== null) {
      throw new Error("RECEIPT_IMMUTABLE");
    }
    await cache.put(RECEIPTS, receipt.id, receipt);
  }

  return { listAll, listByOrder, listByPayment, getReceipt, saveReceipt };
}