import type { AppointmentRecord } from "@/domain/appointments/appointments";
import type { Customer } from "@/domain/clients/customer";
import type { FabricRecord } from "@/domain/inventory/fabrics";
import type { OrderRecord } from "@/domain/orders/order";
import type { TeamMemberRecord } from "@/domain/team/teamMember";

export type SearchEntityKind =
  | "customer"
  | "order"
  | "fabric"
  | "appointment"
  | "member";

export interface SearchHit {
  kind: SearchEntityKind;
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
  term: string;
}

export function normalizeSearchTerm(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function matches(term: string, ...candidates: (string | null | undefined)[]): boolean {
  if (term === "") return false;
  const haystacks = candidates
    .filter((c): c is string => typeof c === "string" && c !== null)
    .map(normalizeSearchTerm);
  return haystacks.some((h) => h.includes(term));
}

export function buildCustomerHits(term: string, customers: Customer[]): SearchHit[] {
  const normalized = normalizeSearchTerm(term);
  return customers
    .filter((c) => matches(normalized, c.full_name, c.phone, c.whatsapp, c.email))
    .slice(0, 6)
    .map((c) => ({
      kind: "customer" as const,
      id: c.id,
      title: c.full_name,
      subtitle: c.phone ?? c.email ?? null,
      href: "/clients",
      term: term,
    }));
}

export function buildOrderHits(term: string, orders: OrderRecord[]): SearchHit[] {
  const normalized = normalizeSearchTerm(term);
  return orders
    .filter((o) => matches(normalized, o.reference, o.notes))
    .slice(0, 6)
    .map((o) => ({
      kind: "order" as const,
      id: o.id,
      title: o.reference,
      subtitle: o.status,
      href: "/commandes",
      term: term,
    }));
}

export function buildFabricHits(term: string, fabrics: FabricRecord[]): SearchHit[] {
  const normalized = normalizeSearchTerm(term);
  return fabrics
    .filter((f) => matches(normalized, f.name, f.color, f.supplier))
    .slice(0, 5)
    .map((f) => ({
      kind: "fabric" as const,
      id: f.id,
      title: f.name,
      subtitle: f.color ?? f.supplier ?? null,
      href: "/stock",
      term: term,
    }));
}

export function buildAppointmentHits(
  term: string,
  appointments: AppointmentRecord[],
  customers: Customer[],
): SearchHit[] {
  const normalized = normalizeSearchTerm(term);
  const customerById = new Map(customers.map((c) => [c.id, c]));
  return appointments
    .filter((a) => matches(normalized, customerById.get(a.customer_id)?.full_name))
    .slice(0, 5)
    .map((a) => ({
      kind: "appointment" as const,
      id: a.id,
      title: customerById.get(a.customer_id)?.full_name ?? "Rendez-vous",
      subtitle: `${a.type} · ${a.starts_at.slice(0, 10)}`,
      href: "/rdv",
      term: term,
    }));
}

export function buildMemberHits(term: string, members: TeamMemberRecord[]): SearchHit[] {
  const normalized = normalizeSearchTerm(term);
  return members
    .filter((m) => matches(normalized, m.full_name, m.phone))
    .slice(0, 4)
    .map((m) => ({
      kind: "member" as const,
      id: m.id,
      title: m.full_name,
      subtitle: m.role,
      href: "/equipe",
      term: term,
    }));
}