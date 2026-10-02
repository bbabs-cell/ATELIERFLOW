import { SyncEngine } from "@/application/sync/engine";
import { newIdempotencyKey } from "@/domain/ids/idempotency";
import {
  buildReceipt,
  nextReceiptSequence,
} from "@/domain/orders/receipts";
import type { ReceiptRecord } from "@/domain/orders/receipts";
import type { OrderItemRecord, OrderRecord } from "@/domain/orders/order";
import type { PaymentRecord } from "@/domain/orders/payments";
import type { Customer } from "@/domain/clients/customer";
import type { CustomersRepository } from "@/repository/ports/clients";
import type { OrderItemsRepository, OrdersRepository } from "@/repository/ports/orders";
import type { PaymentsRepository } from "@/repository/ports/payments";
import type { ReceiptsRepository } from "@/repository/ports/receipts";

const RECEIPTS = "receipts";

export type IssueReceiptResult =
  | { ok: true; receipt: ReceiptRecord }
  | { ok: false; reason: string };

/** Données sources d'un reçu, telles qu'enregistrées sur l'appareil. */
export interface ReceiptSources {
  receipt: ReceiptRecord;
  order: OrderRecord;
  items: OrderItemRecord[];
  customer: Customer | null;
  payment: PaymentRecord | null;
  /** Le reçu est confirmé par le serveur (plus aucune opération en attente). */
  settled: boolean;
}

export interface ReceiptService {
  issuePaymentReceipt(paymentId: string): Promise<IssueReceiptResult>;
  issueCorrectionReceipt(paymentId: string): Promise<IssueReceiptResult>;
  orderReceipts(orderId: string): Promise<ReceiptRecord[]>;
  receiptSources(receiptId: string): Promise<ReceiptSources | null>;
}

export interface ReceiptServiceDeps {
  tenantId: string;
  profileId: string | null;
  orders: OrdersRepository;
  payments: PaymentsRepository;
  receipts: ReceiptsRepository;
  items?: OrderItemsRepository;
  customers?: CustomersRepository;
  engine: SyncEngine;
  now?: () => string;
  uuid?: () => string;
}

export function createReceiptService(deps: ReceiptServiceDeps): ReceiptService {
  const now = deps.now ?? (() => new Date().toISOString());
  const port =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto
      : undefined;
  const uuid = deps.uuid ?? (() => port?.randomUUID() ?? newIdempotencyKey());

  async function enqueue(payload: ReceiptRecord) {
    await deps.engine.enqueue({
      tenantId: deps.tenantId,
      profileId: deps.profileId,
      entity: RECEIPTS,
      entityId: payload.id,
      operation: "INSERT",
      payload,
    });
  }

  async function issue(
    paymentId: string,
    isCorrection: boolean,
  ): Promise<IssueReceiptResult> {
    const payment = await deps.payments.getPayment(paymentId);
    if (payment === null) {
      return { ok: false, reason: "Paiement introuvable." };
    }
    if (isCorrection && payment.status !== "CANCELLED") {
      return {
        ok: false,
        reason: "Le contre-avoir ne concerne qu'un paiement annulé.",
      };
    }
    if (!isCorrection && payment.status !== "VALID") {
      return {
        ok: false,
        reason: "Seul un paiement validé reçoit un reçu.",
      };
    }

    const existing = await deps.receipts.listByPayment(paymentId);
    const alreadySameKind = existing.some(
      (r) => r.is_correction === isCorrection,
    );
    if (alreadySameKind) {
      return {
        ok: false,
        reason: isCorrection
          ? "Un contre-avoir existe déjà pour ce paiement."
          : "Un reçu existe déjà pour ce paiement.",
      };
    }

    const order = await deps.orders.getOrder(payment.order_id);
    if (order === null) {
      return { ok: false, reason: "Commande introuvable." };
    }

    const allPayments = await deps.payments.listByOrder(order.id);
    let totalPaid = 0;
    for (const p of allPayments) {
      if (p.status !== "VALID") continue;
      if (!Number.isSafeInteger(p.amount) || p.amount <= 0) continue;
      totalPaid += p.amount;
    }
    const diff = order.total_price - totalPaid;
    const state = {
      total: order.total_price,
      totalPaid,
      remaining: diff >= 0 ? diff : 0,
      surplus: diff >= 0 ? 0 : -diff,
    };

    const references = (await deps.receipts.listAll()).map((r) => r.reference);
    const year = new Date(now()).getFullYear();
    const sequence = nextReceiptSequence(year, references);

    const receipt = buildReceipt({
      id: uuid(),
      reference: `REC-${year}-${String(sequence).padStart(6, "0")}`,
      tenant_id: deps.tenantId,
      order_id: order.id,
      payment_id: payment.id,
      amount: payment.amount,
      method: payment.method,
      state,
      is_correction: isCorrection,
      issued_by: deps.profileId,
      issued_at: now(),
    });

    await deps.receipts.saveReceipt(receipt);
    await enqueue(receipt);
    return { ok: true, receipt };
  }

  return {
    issuePaymentReceipt: (paymentId) => issue(paymentId, false),
    issueCorrectionReceipt: (paymentId) => issue(paymentId, true),
    async orderReceipts(orderId) {
      return deps.receipts.listByOrder(orderId);
    },
    async receiptSources(receiptId) {
      const receipt = await deps.receipts.getReceipt(receiptId);
      if (receipt === null) return null;
      const order = await deps.orders.getOrder(receipt.order_id);
      if (order === null) return null;
      const [items, customer, payment, settled] = await Promise.all([
        deps.items ? deps.items.listByOrder(order.id) : Promise.resolve([]),
        deps.customers ? deps.customers.getCustomer(order.customer_id) : Promise.resolve(null),
        receipt.payment_id ? deps.payments.getPayment(receipt.payment_id) : Promise.resolve(null),
        deps.engine.isSettled(RECEIPTS, receipt.id),
      ]);
      return { receipt, order, items, customer, payment, settled };
    },
  };
}