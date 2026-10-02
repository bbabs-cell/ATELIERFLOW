import { describe, expect, it } from "vitest";
import {
  buildReceiptDocument,
  receiptFileName,
  receiptShareMessage,
  receiptWhatsappUrl,
  type ReceiptDocumentInput,
} from "@/domain/orders/receiptDocument";
import type { ReceiptRecord } from "@/domain/orders/receipts";
import { formatFcfa } from "@/domain/money";
import type { OrderItemRecord } from "@/domain/orders/order";
import { identityFromTenant, mergeReceiptSettings, validateIdentity } from "@/domain/tenant/identity";

const receipt: ReceiptRecord = {
  id: "r1",
  tenant_id: "t",
  order_id: "o1",
  payment_id: "p1",
  reference: "REC-2026-000042",
  amount: 20000,
  method: "WAVE",
  state: { total: 50000, totalPaid: 35000, remaining: 15000, surplus: 0 },
  is_correction: false,
  issued_by: null,
  pdf_key: null,
  issued_at: "2026-10-02T14:05:00.000Z",
  created_at: "2026-10-02T14:05:00.000Z",
};

function item(over: Partial<OrderItemRecord>): OrderItemRecord {
  return {
    id: "i",
    order_id: "o1",
    tenant_id: "t",
    description: "Boubou brodé",
    garment_type: null,
    measurement_profile_id: null,
    fabric_id: null,
    fabric_meters: null,
    quantity: 1,
    unit_price: 30000,
    notes: null,
    sort_order: 0,
    created_at: "",
    updated_at: "",
    deleted_at: null,
    ...over,
  };
}

function input(over: Partial<ReceiptDocumentInput> = {}): ReceiptDocumentInput {
  return {
    receipt,
    order: { reference: "ORD-2026-000007" },
    items: [
      item({ id: "b", description: "Pantalon", quantity: 2, unit_price: 10000, sort_order: 1 }),
      item({ id: "a", sort_order: 0 }),
      item({ id: "x", description: "Supprimé", deleted_at: "2026-10-01" }),
    ],
    customer: { full_name: "Awa Ndiaye", phone: "+221 77 123 45 67" },
    payment: { note: "Acompte", cancellation_reason: null },
    atelier: { name: "Top Couture", phone: "+221 33 000 00 00", address: "Dakar", footer: null },
    provisional: false,
    timeZone: "Africa/Dakar",
    ...over,
  };
}

describe("buildReceiptDocument", () => {
  it("reprend exactement l'état figé du reçu", () => {
    const doc = buildReceiptDocument(input());
    expect(doc.kind).toBe("RECEIPT");
    expect(doc.title).toBe("Reçu de paiement");
    expect(doc.reference).toBe("REC-2026-000042");
    expect(doc.payment.amount).toBe(20000);
    expect(doc.payment.amountLabel).toBe(formatFcfa(20000));
    expect(doc.payment.amountInWords).toBe("vingt mille francs CFA");
    expect(doc.payment.method).toBe("Wave");
    expect(doc.state).toEqual({ total: 50000, totalPaid: 35000, remaining: 15000, surplus: 0 });
    expect(doc.balance).toEqual({ label: "Reste à payer", amount: 15000, tone: "remaining" });
    expect(doc.issuedAtLabel).toBe("2 octobre 2026 à 14:05");
    expect(doc.customer).toEqual({ name: "Awa Ndiaye", phone: "+221 77 123 45 67" });
  });

  it("lignes triées, articles supprimés exclus, montants par ligne", () => {
    const doc = buildReceiptDocument(input());
    expect(doc.order.lines).toEqual([
      { description: "Boubou brodé", quantity: 1, unitPrice: 30000, total: 30000 },
      { description: "Pantalon", quantity: 2, unitPrice: 10000, total: 20000 },
    ]);
  });

  it("surplus et commande soldée", () => {
    const surplus = buildReceiptDocument(input({ receipt: { ...receipt, state: { total: 50000, totalPaid: 55000, remaining: 0, surplus: 5000 } } }));
    expect(surplus.balance).toEqual({ label: "Surplus à rendre", amount: 5000, tone: "surplus" });
    const settled = buildReceiptDocument(input({ receipt: { ...receipt, state: { total: 50000, totalPaid: 50000, remaining: 0, surplus: 0 } } }));
    expect(settled.balance.tone).toBe("settled");
  });

  it("contre-avoir : titre, motif d'annulation, nom de fichier", () => {
    const doc = buildReceiptDocument(
      input({
        receipt: { ...receipt, is_correction: true },
        payment: { note: null, cancellation_reason: "Erreur de saisie" },
      }),
    );
    expect(doc.kind).toBe("CREDIT");
    expect(doc.title).toBe("Contre-avoir");
    expect(doc.payment.cancellationReason).toBe("Erreur de saisie");
    expect(receiptFileName(doc)).toBe("Contre-avoir-REC-2026-000042.pdf");
    expect(receiptFileName(buildReceiptDocument(input()))).toBe("Recu-REC-2026-000042.pdf");
  });

  it("client inconnu", () => {
    const doc = buildReceiptDocument(input({ customer: null }));
    expect(doc.customer).toEqual({ name: "Client", phone: null });
    expect(receiptShareMessage(doc).startsWith("Bonjour, voici votre reçu")).toBe(true);
  });
});

describe("partage", () => {
  it("message WhatsApp avec solde", () => {
    const message = receiptShareMessage(buildReceiptDocument(input()));
    expect(message).toContain("Bonjour Awa Ndiaye, voici votre reçu REC-2026-000042");
    expect(message).toContain(`Reste à payer : ${formatFcfa(15000)}.`);
    expect(message).toContain("Top Couture");
  });

  it("lien direct si numéro international, sinon partage libre", () => {
    expect(receiptWhatsappUrl("+221 77 123 45 67", "a b")).toBe("https://wa.me/221771234567?text=a%20b");
    expect(receiptWhatsappUrl("00221771234567", "x")).toBe("https://wa.me/221771234567?text=x");
    expect(receiptWhatsappUrl("77 123 45 67", "x")).toBe("https://wa.me/?text=x");
    expect(receiptWhatsappUrl(null, "x")).toBe("https://wa.me/?text=x");
  });
});

describe("coordonnées de l'atelier", () => {
  it("lecture tolérante de tenants.settings", () => {
    expect(identityFromTenant({ name: "Top Couture", settings: { receipt: { phone: " 77 ", address: "", footer: 3 } } })).toEqual({
      name: "Top Couture",
      phone: "77",
      address: null,
      footer: null,
    });
    expect(identityFromTenant(null).name).toBe("Mon atelier");
  });

  it("validation et fusion sans perdre les autres réglages", () => {
    const bad = validateIdentity({ name: " ", phone: null, address: "x".repeat(121), footer: null });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.errors).sort()).toEqual(["address", "name"]);
    const good = validateIdentity({ name: "  Top   Couture ", phone: " +221 ", address: "", footer: null });
    expect(good).toEqual({ ok: true, value: { name: "Top Couture", phone: "+221", address: null, footer: null } });
    if (good.ok) {
      expect(mergeReceiptSettings({ theme: "dark", receipt: { old: 1 } }, good.value)).toEqual({
        theme: "dark",
        receipt: { phone: "+221", address: null, footer: null },
      });
    }
  });
});
