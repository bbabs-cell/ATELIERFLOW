import { describe, expect, it } from "vitest";
import {
  cancellationReasonValid,
  isPaymentCancellable,
  paymentBalance,
  validateNewPayment,
  type PaymentRecord,
} from "@/domain/orders/payments";

function payment(overrides: Partial<PaymentRecord> = {}): PaymentRecord {
  return {
    id: "p1",
    tenant_id: "t1",
    order_id: "o1",
    amount: 1000,
    method: "CASH",
    status: "VALID",
    idempotency_key: "00000000-0000-4000-8000-000000000001",
    recorded_by: "u1",
    note: null,
    cancelled_by: null,
    cancelled_at: null,
    cancellation_reason: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("paiements — validation", () => {
  it("exige une commande, un montant entier positif et un mode connu", () => {
    expect(
      validateNewPayment({ orderId: "", amount: 1000, method: "CASH" }).ok,
    ).toBe(false);
    const amount = validateNewPayment({
      orderId: "o1",
      amount: 0,
      method: "CASH",
    });
    expect(amount.ok).toBe(false);
    const method = validateNewPayment({
      orderId: "o1",
      amount: 100,
      method: "BITCOIN" as never,
    });
    expect(method.ok).toBe(false);
    const ok = validateNewPayment({
      orderId: "o1",
      amount: 2500,
      method: "WAVE",
      note: "acompte",
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value.note).toBe("acompte");
  });
});

describe("paiements — solde recalculé", () => {
  it("scénario canonique : reste à payer, puis surplus après annulation du dernier paiement", () => {
    const a = payment({ id: "a", amount: 20000, created_at: "2026-01-01T09:00:00.000Z" });
    const b = payment({ id: "b", amount: 15000, created_at: "2026-01-02T09:00:00.000Z" });
    const c = payment({ id: "c", amount: 20000, created_at: "2026-01-03T09:00:00.000Z" });

    const afterFirst = paymentBalance(50000, [a]);
    expect(afterFirst.totalPaid).toBe(20000);
    expect(afterFirst.remaining).toBe(30000);
    expect(afterFirst.surplus).toBe(0);

    const afterSecond = paymentBalance(50000, [a, b]);
    expect(afterSecond.totalPaid).toBe(35000);
    expect(afterSecond.remaining).toBe(15000);
    expect(afterSecond.surplus).toBe(0);

    const overpaid = paymentBalance(50000, [a, b, c]);
    expect(overpaid.totalPaid).toBe(55000);
    expect(overpaid.remaining).toBe(0);
    expect(overpaid.surplus).toBe(5000);

    const cancelled = payment({ ...c, status: "CANCELLED" });
    const reverted = paymentBalance(50000, [a, b, cancelled]);
    expect(reverted.totalPaid).toBe(35000);
    expect(reverted.remaining).toBe(15000);
    expect(reverted.surplus).toBe(0);
  });

  it("ignore les paiements annulés dans l'ordre chronologique", () => {
    const first = payment({
      id: "a",
      amount: 10000,
      created_at: "2026-01-01T09:00:00.000Z",
    });
    const cancelledFirst = payment({
      ...first,
      status: "CANCELLED",
    });
    const second = payment({
      id: "b",
      amount: 30000,
      created_at: "2026-01-02T09:00:00.000Z",
    });
    const balance = paymentBalance(40000, [cancelledFirst, second]);
    expect(balance.totalPaid).toBe(30000);
    expect(balance.remaining).toBe(10000);
  });

  it("rejette les montants qui feraient déborder le total payé", () => {
    const nearMax = payment({
      amount: Number.MAX_SAFE_INTEGER - 1,
    });
    const overflowing = payment({
      id: "b",
      amount: 5,
    });
    const balance = paymentBalance(50000, [nearMax, overflowing]);
    expect(balance.totalPaid).toBe(0);
    expect(balance.remaining).toBe(50000);
  });
});

describe("paiements — annulation douce", () => {
  it("un paiement validé est annulable, pas deux fois", () => {
    const valid = payment();
    expect(isPaymentCancellable(valid)).toBe(true);
    const cancelled = payment({ status: "CANCELLED" });
    expect(isPaymentCancellable(cancelled)).toBe(false);
  });

  it("la raison d'annulation est obligatoire", () => {
    expect(cancellationReasonValid("")).toBe(false);
    expect(cancellationReasonValid("   ")).toBe(false);
    expect(cancellationReasonValid(null)).toBe(false);
    expect(cancellationReasonValid("client a renoncé")).toBe(true);
  });
});