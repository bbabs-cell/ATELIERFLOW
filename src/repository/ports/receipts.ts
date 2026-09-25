import type { ReceiptRecord } from "@/domain/orders/receipts";

export interface ReceiptsRepository {
  listAll(): Promise<ReceiptRecord[]>;
  listByOrder(orderId: string): Promise<ReceiptRecord[]>;
  listByPayment(paymentId: string): Promise<ReceiptRecord[]>;
  getReceipt(id: string): Promise<ReceiptRecord | null>;
  /** Insert seulement : un reçu émis est immuable (miroir du trigger receipts_no_edit). */
  saveReceipt(receipt: ReceiptRecord): Promise<void>;
}