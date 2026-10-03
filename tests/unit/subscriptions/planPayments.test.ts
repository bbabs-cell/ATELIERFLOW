import { describe, expect, it } from "vitest";
import {
  checkProof,
  MAX_PROOF_BYTES,
  methodsForCountry,
  parsePlanPayment,
  paymentAmount,
  paymentCountries,
  planPaymentErrorCode,
  planPaymentErrorMessage,
  proofKey,
  type PaymentMethod,
} from "@/domain/subscriptions/planPayments";
import { FileServiceError } from "@/infrastructure/files/fileService";
import type { R2Storage } from "@/infrastructure/files/r2";
import { createPlanPaymentService, type PlanPaymentsDb } from "@/infrastructure/subscriptions/planPaymentService";

const T = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const REQ = "55555555-5555-4555-8555-555555555555";
const METHOD = "66666666-6666-4666-8666-666666666666";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const PDF = new TextEncoder().encode("%PDF-1.7\n...");
const HTML = new TextEncoder().encode("<html>");

function method(over: Partial<PaymentMethod>): PaymentMethod {
  return {
    id: METHOD,
    countryCode: "SN",
    countryName: "Sénégal",
    label: "Wave",
    accountNumber: "770000000",
    accountName: null,
    instructions: null,
    isActive: true,
    sortOrder: 0,
    ...over,
  };
}

function fakeStorage() {
  const objects = new Map<string, Uint8Array>();
  const storage: R2Storage = {
    bucket: "atelier-files",
    async put(key, body) {
      objects.set(key, body);
    },
    async remove(key) {
      objects.delete(key);
    },
    async signedGetUrl(key, ttl) {
      return `https://r2.test/${key}?ttl=${ttl}`;
    },
  };
  return { storage, objects };
}

const FORM = { planCode: "PRO", months: "3", methodId: METHOD, senderName: " Awa Diop ", senderPhone: "", reference: "WAVE-1" };

describe("règles du paiement de plan", () => {
  it("montant = prix mensuel × mois, en entiers", () => {
    expect(paymentAmount(10_000, 3)).toBe(30_000);
    expect(paymentAmount(10_000, 12)).toBe(120_000);
  });

  it("pays : seulement ceux qui ont un moyen actif, triés ; moyens d'un pays triés", () => {
    const methods = [
      method({ id: "a", countryCode: "SN", countryName: "Sénégal", label: "Wave", sortOrder: 2 }),
      method({ id: "b", countryCode: "SN", countryName: "Sénégal", label: "Orange Money", sortOrder: 1 }),
      method({ id: "c", countryCode: "CI", countryName: "Côte d'Ivoire", label: "MTN" }),
      method({ id: "d", countryCode: "ML", countryName: "Mali", label: "Ancien", isActive: false }),
    ];
    expect(paymentCountries(methods)).toEqual([
      { code: "CI", name: "Côte d'Ivoire" },
      { code: "SN", name: "Sénégal" },
    ]);
    expect(methodsForCountry(methods, "SN").map((m) => m.label)).toEqual(["Orange Money", "Wave"]);
    expect(methodsForCountry(methods, "ML")).toEqual([]);
  });

  it("preuve : photo ou PDF lus dans les octets, taille bornée", () => {
    expect(checkProof(JPEG)).toEqual({ ok: true, mime: "image/jpeg" });
    expect(checkProof(PDF)).toEqual({ ok: true, mime: "application/pdf" });
    expect(checkProof(HTML)).toEqual({ ok: false, code: "VALIDATION:mime" });
    expect(checkProof(new Uint8Array())).toEqual({ ok: false, code: "VALIDATION:empty" });
    expect(checkProof(new Uint8Array(MAX_PROOF_BYTES + 1))).toEqual({ ok: false, code: "VALIDATION:size" });
  });

  it("clé de la preuve dans le dossier de l'atelier, au nom de la demande", () => {
    expect(proofKey(T, REQ, "application/pdf")).toBe(`tenants/${T}/plan-payments/${REQ}.pdf`);
    expect(() => proofKey("x", REQ, "image/jpeg")).toThrow();
  });

  it("codes d'erreur traduits", () => {
    expect(planPaymentErrorCode("ERROR: PAYMENT_ALREADY_PENDING")).toBe("PAYMENT_ALREADY_PENDING");
    expect(planPaymentErrorCode("NOT_FOUND:payment_methods (P0001)")).toBe("NOT_FOUND:payment_methods");
    expect(planPaymentErrorMessage("PAYMENT_ALREADY_PENDING")).toMatch(/déjà en cours/);
  });

  it("lecture d'une ligne serveur", () => {
    const p = parsePlanPayment({ id: REQ, tenant_id: T, months: 3, amount: "30000", currency: "XOF", status: "REJECTED", review_note: "Montant incomplet" });
    expect(p.amount).toBe(30_000);
    expect(p.status).toBe("REJECTED");
    expect(p.reviewNote).toBe("Montant incomplet");
  });
});

describe("service serveur des paiements de plan", () => {
  it("range la preuve puis enregistre la demande, sans jamais transmettre de montant", async () => {
    const { storage, objects } = fakeStorage();
    let sent: Parameters<PlanPaymentsDb["submit"]>[0] | null = null;
    const db: PlanPaymentsDb = {
      async submit(input) {
        sent = input;
        return { id: input.id, status: "PENDING" };
      },
      async proof() {
        throw new Error("unused");
      },
    };
    const service = createPlanPaymentService({ tenantId: T, storage, db, uuid: () => REQ });
    const res = await service.submit(FORM, JPEG);
    expect(res.status).toBe("PENDING");
    expect(sent).toMatchObject({ id: REQ, planCode: "PRO", months: 3, senderName: "Awa Diop", senderPhone: null, key: `tenants/${T}/plan-payments/${REQ}.jpg` });
    expect(sent).not.toHaveProperty("amount");
    expect(objects.has(`tenants/${T}/plan-payments/${REQ}.jpg`)).toBe(true);
  });

  it("refus de la base : la preuve est retirée du stockage", async () => {
    const { storage, objects } = fakeStorage();
    const db: PlanPaymentsDb = {
      async submit() {
        throw new Error('PAYMENT_ALREADY_PENDING');
      },
      async proof() {
        throw new Error("unused");
      },
    };
    const service = createPlanPaymentService({ tenantId: T, storage, db, uuid: () => REQ });
    await expect(service.submit(FORM, JPEG)).rejects.toMatchObject({ code: "PAYMENT_ALREADY_PENDING", status: 409 });
    expect(objects.size).toBe(0);
  });

  it("formulaire incomplet ou fichier non accepté : rien n'est envoyé", async () => {
    const { storage, objects } = fakeStorage();
    const db = { submit: async () => ({}), proof: async () => ({ tenantId: T, key: "" }) };
    const service = createPlanPaymentService({ tenantId: T, storage, db });
    await expect(service.submit({ ...FORM, months: "2" }, JPEG)).rejects.toBeInstanceOf(FileServiceError);
    await expect(service.submit({ ...FORM, senderName: " " }, JPEG)).rejects.toMatchObject({ code: "VALIDATION:body" });
    await expect(service.submit(FORM, HTML)).rejects.toMatchObject({ code: "VALIDATION:mime" });
    expect(objects.size).toBe(0);
  });

  it("lien signé seulement pour la clé de la demande, dans le dossier de son atelier", async () => {
    const { storage } = fakeStorage();
    const ok = createPlanPaymentService({
      tenantId: OTHER,
      storage,
      db: { submit: async () => ({}), proof: async () => ({ tenantId: T, key: `tenants/${T}/plan-payments/${REQ}.pdf` }) },
    });
    // La plateforme (autre atelier) lit la preuve que la base lui autorise.
    expect(await ok.proofUrl(REQ)).toBe(`https://r2.test/tenants/${T}/plan-payments/${REQ}.pdf?ttl=600`);

    const tampered = createPlanPaymentService({
      tenantId: T,
      storage,
      db: { submit: async () => ({}), proof: async () => ({ tenantId: T, key: `tenants/${OTHER}/customers/x.jpg` }) },
    });
    await expect(tampered.proofUrl(REQ)).rejects.toMatchObject({ status: 404 });
    await expect(tampered.proofUrl("pas-un-uuid")).rejects.toMatchObject({ status: 400 });
  });
});
