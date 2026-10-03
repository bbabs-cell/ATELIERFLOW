import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { formatFcfa } from "@/domain/money";
import { PDFDocument } from "pdf-lib";
import { buildReceiptDocument } from "@/domain/orders/receiptDocument";
import { renderReceiptPdf, toWinAnsi } from "@/infrastructure/receipts/receiptPdf";
import type { ReceiptRecord } from "@/domain/orders/receipts";

const receipt: ReceiptRecord = {
  id: "r1",
  tenant_id: "t",
  order_id: "o1",
  payment_id: "p1",
  reference: "REC-2026-000042",
  amount: 20000,
  method: "ORANGE_MONEY",
  state: { total: 50000, totalPaid: 35000, remaining: 15000, surplus: 0 },
  is_correction: false,
  issued_by: null,
  pdf_key: null,
  issued_at: "2026-10-02T14:05:00.000Z",
  created_at: "2026-10-02T14:05:00.000Z",
};

function doc(over: { provisional?: boolean; lines?: number; name?: string; correction?: boolean } = {}) {
  return buildReceiptDocument({
    receipt: { ...receipt, is_correction: over.correction ?? false },
    order: { reference: "ORD-2026-000007" },
    items: Array.from({ length: over.lines ?? 2 }, (_, i) => ({
      id: `i${i}`,
      order_id: "o1",
      tenant_id: "t",
      description: `Article ${i + 1} — tissu wax très long pour vérifier la troncature propre`,
      garment_type: null,
      measurement_profile_id: null,
      fabric_id: null,
      fabric_meters: null,
      quantity: 1,
      unit_price: 5000,
      notes: null,
      sort_order: i,
      created_at: "",
      updated_at: "",
      deleted_at: null,
    })),
    customer: { full_name: over.name ?? "Awa Ndiaye", phone: "+221 77 123 45 67" },
    payment: { note: "Acompte", cancellation_reason: over.correction ? "Erreur" : null },
    atelier: { name: "Top Couture chez Abdou", phone: "+221 33 000 00 00", address: "Médina, Dakar", footer: null },
    provisional: over.provisional ?? false,
    timeZone: "Africa/Dakar",
  });
}

/** Texte des flux de contenu (décompressés) : pdf-lib écrit les chaînes en hexadécimal. */
function contentOf(bytes: Uint8Array): string {
  const buffer = Buffer.from(bytes);
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const start = buffer.indexOf("stream\n", from);
    if (start < 0) break;
    const end = buffer.indexOf("endstream", start);
    const chunk = buffer.subarray(start + 7, end);
    try {
      out.push(inflateSync(chunk).toString("latin1"));
    } catch {
      out.push(chunk.toString("latin1"));
    }
    from = end + 9;
  }
  return out.join("\n").toUpperCase();
}

function hexOf(text: string): string {
  return Array.from(toWinAnsi(text), (ch) => (ch.codePointAt(0) ?? 0).toString(16).padStart(2, "0").toUpperCase()).join("");
}

describe("toWinAnsi", () => {
  it("garde le français, remplace l'inencodable", () => {
    expect(toWinAnsi("Reçu « payé » — 50 000 € œ")).toBe("Reçu « payé » — 50 000 € œ");
    expect(toWinAnsi("مرحبا 😀")).toBe("????? ?");
    expect(toWinAnsi("a\nb")).toBe("a b");
  });
});

describe("renderReceiptPdf", () => {
  it("produit un PDF A5 d'une page avec les métadonnées du reçu", async () => {
    const bytes = await renderReceiptPdf(doc());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const parsed = await PDFDocument.load(bytes);
    expect(parsed.getPageCount()).toBe(1);
    const { width, height } = parsed.getPage(0).getSize();
    expect(Math.round(width)).toBe(420);
    expect(Math.round(height)).toBe(595);
    expect(parsed.getTitle()).toBe("Reçu de paiement REC-2026-000042");
    expect(parsed.getAuthor()).toBe("Top Couture chez Abdou");
  });

  it("le contenu porte la référence, le client et les montants validés", async () => {
    const bytes = await renderReceiptPdf(doc());
    const raw = contentOf(bytes);
    for (const text of ["REC-2026-000042", "Awa Ndiaye", "ORD-2026-000007", formatFcfa(20000), formatFcfa(15000), "Orange Money", "Reste à payer"]) {
      expect(raw, text).toContain(hexOf(text));
    }
  });

  it("contre-avoir, référence provisoire, nombreux articles et caractères non latins : sans erreur", async () => {
    const bytes = await renderReceiptPdf(doc({ correction: true, provisional: true, lines: 25, name: "عبد الله" }));
    const parsed = await PDFDocument.load(bytes);
    expect(parsed.getPageCount()).toBe(1);
    const raw = contentOf(bytes);
    expect(raw).toContain(hexOf("Ce contre-avoir annule"));
    expect(raw).toContain(hexOf("RÉFÉRENCE PROVISOIRE"));
    expect(raw).toContain(hexOf("autres articles"));
  });

  it("intègre le logo de l'atelier ; un logo illisible est ignoré", async () => {
    // PNG 1×1 valide
    const png = Uint8Array.from(
      atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="),
      (ch) => ch.charCodeAt(0),
    );
    const withLogo = await renderReceiptPdf(doc(), { logo: { bytes: png, mime: "image/png" } });
    const parsed = await PDFDocument.load(withLogo);
    expect(parsed.getPageCount()).toBe(1);
    expect(new TextDecoder("latin1").decode(withLogo)).toContain("/Subtype /Image");
    expect(contentOf(withLogo)).toContain(hexOf(receipt.reference));

    const broken = await renderReceiptPdf(doc(), { logo: { bytes: new Uint8Array([1, 2, 3]), mime: "image/png" } });
    expect((await PDFDocument.load(broken)).getPageCount()).toBe(1);
  });
});
