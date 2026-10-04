import { describe, expect, it } from "vitest";
import type { AppointmentRecord } from "@/domain/appointments/appointments";
import type { Customer } from "@/domain/clients/customer";
import type { FabricRecord } from "@/domain/inventory/fabrics";
import type { OrderRecord } from "@/domain/orders/order";
import type { PaymentRecord } from "@/domain/orders/payments";
import { permissionsFor, type TenantRoleCode } from "@/domain/team/roles";
import { answerQuestion, findCustomerInQuestion, parsePeriod, rankUrgentOrders, type AssistantAnswer, type AssistantData } from "@/domain/assistant/assistant";
import { HELP_TOPICS } from "@/domain/assistant/help";
import { hasPhrase, isHowTo, normalizeText } from "@/domain/assistant/text";

const NOW = "2026-10-14T09:00:00.000Z"; // mercredi

const customer = (id: string, name: string): Customer => ({
  id,
  tenant_id: "t1",
  full_name: name,
  phone: null,
  whatsapp: null,
  email: null,
  address: null,
  notes: null,
  photo_key: null,
  status: "ACTIVE",
  created_by: null,
  created_at: "2026-10-02T10:00:00.000Z",
  updated_at: "2026-10-02T10:00:00.000Z",
  deleted_at: null,
});

const order = (id: string, over: Partial<OrderRecord>): OrderRecord => ({
  id,
  tenant_id: "t1",
  customer_id: "c1",
  reference: `ORD-2026-00000${id.slice(1)}`,
  status: "SEWING",
  priority: "NORMAL",
  total_price: 40_000,
  expected_at: null,
  delivered_at: null,
  employee_id: null,
  notes: null,
  created_by: null,
  created_at: "2026-10-01T10:00:00.000Z",
  updated_at: "2026-10-01T10:00:00.000Z",
  deleted_at: null,
  ...over,
});

const payment = (orderId: string, amount: number, at = "2026-10-13T10:00:00.000Z"): PaymentRecord => ({
  id: `p-${orderId}-${amount}`,
  tenant_id: "t1",
  order_id: orderId,
  amount,
  method: "CASH",
  status: "VALID",
  idempotency_key: `k-${orderId}-${amount}`,
  recorded_by: null,
  note: null,
  cancelled_by: null,
  cancelled_at: null,
  cancellation_reason: null,
  created_at: at,
  updated_at: at,
});

const appointment = (id: string, customerId: string, startsAt: string): AppointmentRecord => ({
  id,
  tenant_id: "t1",
  customer_id: customerId,
  order_id: null,
  type: "FITTING",
  starts_at: startsAt,
  ends_at: null,
  status: "SCHEDULED",
  note: null,
  created_by: null,
  created_at: NOW,
  updated_at: NOW,
  deleted_at: null,
});

const fabric = (id: string, name: string, quantity: number): FabricRecord =>
  ({ id, tenant_id: "t1", name, color: null, supplier: null, quantity, unit: "m", unit_price: 2000, photo_key: null, status: "ACTIVE", created_at: NOW, updated_at: NOW }) as FabricRecord;

const STATUS = {
  REGISTERED: "Enregistrée",
  FABRIC_RECEIVED: "Tissu reçu",
  PREPARATION: "Préparation",
  SEWING: "En couture",
  FITTING: "Essayage",
  ALTERATION: "Retouches",
  COMPLETED: "Terminée",
  READY_FOR_PICKUP: "À retirer",
  DELIVERED: "Livrée",
  CANCELLED: "Annulée",
} as const;

function data(role: TenantRoleCode = "OWNER"): AssistantData {
  return {
    now: NOW,
    timeZone: "UTC",
    permissions: new Set(permissionsFor(role)),
    customers: [customer("c1", "Awa Diop"), customer("c2", "Moussa Ba"), customer("c3", "Fatou Sow")],
    orders: [
      order("o1", { expected_at: "2026-10-10", priority: "NORMAL" }), // 4 j de retard
      order("o2", { customer_id: "c2", expected_at: "2026-10-15", priority: "HIGH", status: "FITTING" }), // demain
      order("o3", { customer_id: "c2", status: "READY_FOR_PICKUP", total_price: 25_000 }),
      order("o4", { customer_id: "c3", expected_at: "2026-11-30", priority: "LOW" }),
      order("o5", { status: "DELIVERED", total_price: 10_000 }),
      order("o6", { status: "CANCELLED", total_price: 99_000 }),
    ],
    payments: [payment("o1", 15_000), payment("o3", 25_000, "2026-10-01T10:00:00.000Z"), payment("o5", 10_000, "2026-09-20T10:00:00.000Z")],
    appointments: [appointment("a1", "c1", "2026-10-15T10:30:00.000Z"), appointment("a2", "c3", "2026-10-14T15:00:00.000Z")],
    fabrics: [fabric("f1", "Bazin blanc", 50), fabric("f2", "Wax rouge", 1200)],
    money: (n) => `${n} F`,
    labels: { status: STATUS, priority: { LOW: "Basse", NORMAL: "Normale", HIGH: "Haute", URGENT: "Urgente" } },
  };
}

const ask = (q: string, role?: TenantRoleCode): AssistantAnswer => answerQuestion(q, data(role));
const text = (a: AssistantAnswer) => a.blocks.map((b) => [b.title, b.text, ...(b.items ?? []).map((i) => `${i.label} ${i.detail ?? ""}`), ...(b.steps ?? [])].join(" | ")).join(" || ");

describe("texte", () => {
  it("normalise accents, ponctuation et apostrophes", () => {
    expect(normalizeText("Où est mon REÇU ? J'ai payé !")).toBe("ou est mon recu j ai paye");
    expect(hasPhrase("mes commandes urgentes", "commande")).toBe(true);
    expect(hasPhrase("mon profil", "pro!")).toBe(false);
    expect(hasPhrase("passer en pro", "pro!")).toBe(true);
    expect(isHowTo("comment faire un recu")).toBe(true);
    expect(isHowTo("j ai combien de commandes")).toBe(false);
  });
});

describe("questions sur les données", () => {
  it("« J'ai combien de commandes et quels sont les plus urgents ? »", () => {
    const a = ask("J'ai combien de commandes et quels sont les plus urgents ?");
    expect(a.kind).toBe("data");
    const t = text(a);
    expect(t).toContain("Vous avez 4 commandes en cours, dont 1 en retard et 1 prête à retirer.");
    expect(a.blocks[1].items?.map((i) => i.label)).toEqual(["ORD-2026-000001 · Awa Diop", "ORD-2026-000002 · Moussa Ba"]);
    expect(a.blocks[1].items?.[0].detail).toBe("4 j de retard · En couture");
    expect(a.blocks[1].items?.[1].detail).toBe("à livrer demain · Haute · Essayage");
  });

  it("classe retard > échéance proche > priorité", () => {
    expect(rankUrgentOrders(data()).map((r) => r.order.id)).toEqual(["o1", "o2", "o3", "o4"]);
  });

  it("« Qui me doit de l'argent ? »", () => {
    const a = ask("Qui me doit de l'argent ?");
    expect(a.blocks).toHaveLength(1);
    expect(text(a)).toContain("Vos clients vous doivent 105000 F au total (3 clients).");
    expect(a.blocks[0].items?.[0]).toMatchObject({ label: "Moussa Ba", detail: "40000 F · 1 commande" });
  });

  it("« Combien j'ai encaissé cette semaine ? » et ce mois", () => {
    expect(text(ask("Combien j'ai encaissé cette semaine ?"))).toContain("Vous avez encaissé 15000 F cette semaine (1 paiement).");
    expect(text(ask("chiffre d'affaires du mois"))).toContain("40000 F ce mois-ci (2 paiements)");
    expect(text(ask("j'ai gagné combien le mois dernier"))).toContain("10000 F le mois dernier");
  });

  it("rendez-vous de demain / aujourd'hui / à venir", () => {
    expect(text(ask("Mes rendez-vous de demain"))).toContain("Awa Diop · Essayage");
    expect(text(ask("Mes rendez-vous de demain"))).not.toContain("Fatou");
    expect(text(ask("rdv aujourd'hui"))).toContain("Fatou Sow");
    expect(ask("rendez-vous").blocks[0].items).toHaveLength(2);
  });

  it("prêtes à retirer, retard, stock, clients", () => {
    expect(text(ask("quelles commandes sont prêtes ?"))).toContain("ORD-2026-000003 · Moussa Ba entièrement payée");
    expect(text(ask("commandes en retard"))).toContain("ORD-2026-000001");
    expect(text(ask("est-ce que je manque de tissu ?"))).toContain("Bazin blanc");
    expect(text(ask("combien de clients j'ai"))).toContain("3 clients, dont 3 nouveaux ce mois-ci");
  });

  it("un client nommé dans la question", () => {
    const a = ask("Awa doit combien ?");
    expect(a.blocks[0].title).toBe("Awa Diop");
    expect(text(a)).toContain("Awa Diop a 1 commande en cours. Reste à payer : 25000 F.");
    expect(text(a)).toContain("Prochain rendez-vous : demain");
    expect(text(ask("les commandes de moussa"))).toContain("Moussa Ba a 2 commandes en cours");
    expect(findCustomerInQuestion("commandes de diop", [customer("x", "Awa Diop"), customer("y", "Ali Diop")])).toBeNull();
  });

  it("un numéro de commande", () => {
    expect(text(ask("où en est ORD-2026-000002 ?"))).toContain("Commande de Moussa Ba, étape « Essayage », à livrer demain. Total 40000 F, payé 0 F, reste 40000 F.");
    expect(text(ask("ORD-2026-999999"))).toContain("Je ne trouve pas");
  });

  it("résumé de la journée", () => {
    const a = ask("fais-moi le point du jour");
    expect(a.blocks.length).toBe(4);
  });

  it("respecte les droits : sans « payments.read », pas de montants", () => {
    const d = data("APPRENTICE");
    const limited = { ...d, permissions: new Set([...d.permissions].filter((p) => p !== "payments.read")) };
    expect(text(answerQuestion("Qui me doit de l'argent ?", limited))).toContain("Votre rôle ne permet pas de voir les montants");
    expect(text(answerQuestion("où en est ORD-2026-000002 ?", limited))).not.toContain("Total");
    expect(text(answerQuestion("Awa doit combien ?", limited))).not.toContain("Reste à payer");
  });
});

describe("aide sur l'application", () => {
  const topic = (q: string) => ask(q).blocks[0].title;

  it("trouve la bonne fiche", () => {
    expect(topic("Comment ajouter une photo de profil ?")).toBe("Mettre votre photo de profil");
    expect(topic("comment je fais un reçu")).toBe("Faire un reçu (imprimer, PDF, WhatsApp)");
    expect(topic("où je mets les mensurations ?")).toBe("Enregistrer les mesures (mensurations)");
    expect(topic("comment mettre un modèle")).toBe("Ranger vos modèles (galerie « Mes modèles »)");
    expect(topic("comment ajouter une photo sur la commande")).toBe("Ajouter une photo (tissu, client, commande)");
    expect(topic("comment prendre en photo le tissu du client")).toBe("Ajouter une photo (tissu, client, commande)");
    expect(topic("comment payer l'abonnement ?")).toBe("Changer d'abonnement (payer le plan)");
    expect(topic("comment ajouter un client")).toBe("Ajouter un client");
    expect(topic("comment inviter un employé")).toBe("Ajouter un employé ou un apprenti");
    expect(topic("comment ajouter un tissu")).toBe("Gérer le stock de tissus");
    expect(topic("comment prendre un rendez-vous")).toBe("Prendre un rendez-vous et envoyer un rappel");
    expect(topic("j'ai oublié mon mot de passe")).toBe("Mot de passe oublié");
    expect(topic("comment changer la monnaie")).toBe("Changer le pays ou la monnaie");
    expect(topic("comment exporter pour le comptable")).toBe("Voir le rapport du mois et l'exporter pour Excel");
  });

  it("donne les étapes et un lien", () => {
    const a = ask("comment faire un reçu");
    expect(a.kind).toBe("help");
    expect(a.blocks[0].steps?.length).toBeGreaterThan(1);
    expect(a.links[0].href).toBe("/commandes");
  });

  it("chaque fiche a un titre, des mots-clés et des étapes ; liens internes", () => {
    const ids = new Set<string>();
    for (const t of HELP_TOPICS) {
      expect(ids.has(t.id)).toBe(false);
      ids.add(t.id);
      expect(t.keywords.length).toBeGreaterThan(0);
      expect(t.steps.length).toBeGreaterThan(0);
      if (t.link) expect(t.link.href.startsWith("/")).toBe(true);
    }
  });
});

describe("conversation", () => {
  it("salutations, remerciements, incompris", () => {
    expect(ask("Bonjour").kind).toBe("smalltalk");
    expect(ask("bonjour").suggestions.length).toBeGreaterThan(3);
    expect(text(ask("merci beaucoup"))).toContain("Avec plaisir");
    expect(ask("le ciel est bleu").kind).toBe("unknown");
    expect(ask("").kind).toBe("smalltalk");
  });
});

describe("périodes", () => {
  it("semaine du lundi au dimanche, mois civil", () => {
    expect(parsePeriod("cette semaine", NOW, "UTC", "month")).toMatchObject({ from: "2026-10-12", to: "2026-10-18" });
    expect(parsePeriod("le mois dernier", NOW, "UTC", "month")).toMatchObject({ from: "2026-09-01", to: "2026-09-30" });
    expect(parsePeriod("", NOW, "UTC", "upcoming")).toMatchObject({ from: "2026-10-14", to: "2026-10-20" });
  });
});
