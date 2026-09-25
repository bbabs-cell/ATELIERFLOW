import { describe, expect, it } from "vitest";
import {
  buildReceipt,
  extractReceiptSequence,
  isReceiptReference,
  newReceiptReference,
  nextReceiptSequence,
  receiptKind,
  type ReceiptState,
} from "@/domain/orders/receipts";

const STATE: ReceiptState = {
  total: 50000,
  totalPaid: 20000,
  remaining: 30000,
  surplus: 0,
};

describe("reçus — références REC-YYYY-XXXXXX", () => {
  it("génère et valide le format, déduit la séquence suivante", () => {
    const ref = newReceiptReference(2026, 1);
    expect(ref).toBe("REC-2026-000001");
    expect(isReceiptReference(ref)).toBe(true);
    expect(isReceiptReference("REC-2026-1")).toBe(false);
    expect(isReceiptReference("ORD-2026-000001")).toBe(false);
    expect(extractReceiptSequence(ref)).toBe(1);

    expect(
      nextReceiptSequence(2026, [
        "REC-2026-000001",
        "REC-2026-000003",
        "REC-2025-000001",
      ]),
    ).toBe(4);
    expect(nextReceiptSequence(2026, [])).toBe(1);
  });

  it("refuse les références invalides", () => {
    expect(() => newReceiptReference(1999, 1)).toThrow("RECEIPT_YEAR_INVALID");
    expect(() => newReceiptReference(2026, 0)).toThrow(
      "RECEIPT_SEQUENCE_INVALID",
    );
  });
});

describe("reçus — construction et immuabilité de principe", () => {
  it("construit un reçu figeant l'état validé", () => {
    const receipt = buildReceipt({
      id: "r1",
      reference: "REC-2026-000001",
      tenant_id: "t1",
      order_id: "o1",
      payment_id: "p1",
      amount: 20000,
      method: "CASH",
      state: STATE,
      is_correction: false,
      issued_by: "u1",
      issued_at: "2026-02-01T00:00:00.000Z",
    });
    expect(receipt.reference).toBe("REC-2026-000001");
    expect(receipt.state.remaining).toBe(30000);
    expect(receipt.pdf_key).toBeNull();
    expect(receipt.created_at).toBe(receipt.issued_at);
  });

  it("rejette un montant négatif ou une référence hors format", () => {
    expect(() =>
      buildReceipt({
        id: "r2",
        reference: "REC-2026-000001",
        tenant_id: "t1",
        order_id: "o1",
        payment_id: "p1",
        amount: -1,
        method: "CASH",
        state: STATE,
        is_correction: false,
        issued_by: null,
        issued_at: "2026-02-01T00:00:00.000Z",
      }),
    ).toThrow("RECEIPT_AMOUNT_INVALID");
    expect(() =>
      buildReceipt({
        id: "r3",
        reference: "BAD",
        tenant_id: "t1",
        order_id: "o1",
        payment_id: "p1",
        amount: 1,
        method: null,
        state: STATE,
        is_correction: false,
        issued_by: null,
        issued_at: "2026-02-01T00:00:00.000Z",
      }),
    ).toThrow("RECEIPT_REFERENCE_INVALID");
  });

  it("distingue reçu et contre-avoir", () => {
    expect(receiptKind(false)).toBe("RECEIPT");
    expect(receiptKind(true)).toBe("CREDIT");
  });
});