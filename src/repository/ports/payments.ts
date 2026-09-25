import type { PaymentRecord } from "@/domain/orders/payments";

export interface PaymentsRepository {
  listAll(): Promise<PaymentRecord[]>;
  listByOrder(orderId: string): Promise<PaymentRecord[]>;
  getPayment(id: string): Promise<PaymentRecord | null>;
  savePayment(payment: PaymentRecord): Promise<void>;
}