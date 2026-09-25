import { describe, expect, it } from "vitest";
import {
  buildAppointmentHits,
  buildCustomerHits,
  buildFabricHits,
  buildMemberHits,
  buildOrderHits,
  normalizeSearchTerm,
} from "@/domain/dashboard/search";
import type { Customer } from "@/domain/clients/customer";
import type { OrderRecord } from "@/domain/orders/order";
import type { FabricRecord } from "@/domain/inventory/fabrics";
import type { AppointmentRecord } from "@/domain/appointments/appointments";
import type { TeamMemberRecord } from "@/domain/team/teamMember";

const T0 = "2026-06-01T08:00:00.000Z";

const customer = (id: string, name: string, phone?: string): Customer => ({
  id,
  tenant_id: "t1",
  full_name: name,
  phone: phone ?? null,
  whatsapp: null,
  email: null,
  address: null,
  notes: null,
  photo_key: null,
  status: "ACTIVE",
  created_by: null,
  created_at: T0,
  updated_at: T0,
  deleted_at: null,
});

const order = (id: string, reference: string): OrderRecord => ({
  id,
  tenant_id: "t1",
  customer_id: "c1",
  reference,
  status: "SEWING",
  priority: "NORMAL",
  total_price: 10_000,
  expected_at: null,
  delivered_at: null,
  employee_id: null,
  notes: null,
  created_by: null,
  created_at: T0,
  updated_at: T0,
  deleted_at: null,
});

const fabric = (id: string, name: string): FabricRecord => ({
  id,
  tenant_id: "t1",
  name,
  color: "Bleu",
  supplier: null,
  quantity: 500,
  unit: "m",
  unit_price: 2500,
  photo_key: null,
  status: "ACTIVE",
  created_at: T0,
  updated_at: T0,
  deleted_at: null,
});

const appointment = (id: string, customerId: string): AppointmentRecord => ({
  id,
  tenant_id: "t1",
  customer_id: customerId,
  order_id: null,
  type: "MEASUREMENTS",
  status: "CONFIRMED",
  starts_at: "2026-06-01T10:00:00.000+02:00",
  ends_at: "2026-06-01T11:00:00.000+02:00",
  note: null,
  created_by: null,
  created_at: T0,
  updated_at: T0,
  deleted_at: null,
});

const member = (id: string, name: string, role: string): TeamMemberRecord => ({
  id,
  tenant_id: "t1",
  full_name: name,
  phone: null,
  role: role as TeamMemberRecord["role"],
  status: "ACTIVE",
  invited_by: null,
  joined_at: T0,
  created_at: T0,
  updated_at: T0,
});

describe("normalizeSearchTerm", () => {
  it("enlève les accents, passe en minuscules, coupe les espaces", () => {
    expect(normalizeSearchTerm("  Équipe Déjà Vu ")).toBe("equipe deja vu");
    expect(normalizeSearchTerm("Koné-PRO")).toBe("kone-pro");
  });
});

describe("builders de hits", () => {
  const customers = [
    customer("c1", "Awa Koné", "+221777000001"),
    customer("c2", "Mamadou Sarr"),
  ];

  it("cherche dans nom, téléphone, email (max 6)", () => {
    expect(buildCustomerHits("awa", customers)).toHaveLength(1);
    expect(buildCustomerHits("kone", customers)).toHaveLength(1);
    expect(buildCustomerHits("77000001", customers).map((h) => h.id)).toEqual(["c1"]);
    expect(buildCustomerHits("sarr", customers).map((h) => h.id)).toEqual(["c2"]);
  });

  it("cherche les commandes par référence (max 6)", () => {
    const orders = [order("o1", "ORD-2026-000001"), order("o2", "ORD-2026-000002")];
    const hits = buildOrderHits("000002", orders);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ kind: "order", href: "/commandes", title: "ORD-2026-000002" });
  });

  it("cherche les tissus par nom/couleur/fournisseur (max 5)", () => {
    const fabrics = [fabric("f1", "Wax ivoire"), fabric("f2", "Bazin riche")];
    const hits = buildFabricHits("bazin", fabrics);
    expect(hits.map((h) => h.id)).toEqual(["f2"]);
    expect(hits[0]).toMatchObject({ kind: "fabric", href: "/stock" });
  });

  it("cherche les rendez-vous par nom de client (max 5)", () => {
    const appts = [appointment("a1", "c1"), appointment("a2", "c2")];
    const hits = buildAppointmentHits("awa", appts, customers);
    expect(hits.map((h) => h.id)).toEqual(["a1"]);
    expect(hits[0]?.subtitle).toContain("MEASUREMENTS");
  });

  it("cherche les membres par nom (max 4)", () => {
    const members = [member("m1", "Fatou Ndiaye", "OWNER"), member("m2", "Ibrahima Bathily", "EMPLOYEE")];
    const hits = buildMemberHits("ndiaye", members);
    expect(hits.map((h) => h.id)).toEqual(["m1"]);
    expect(hits[0]).toMatchObject({ kind: "member", href: "/equipe", subtitle: "OWNER" });
  });

  it("ne retourne rien pour un terme vide", () => {
    expect(buildCustomerHits("", customers)).toEqual([]);
    expect(buildCustomerHits("   ", customers)).toEqual([]);
  });
});