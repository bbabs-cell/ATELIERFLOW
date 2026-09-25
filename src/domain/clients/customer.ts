export const CUSTOMER_STATUSES = ["ACTIVE", "ARCHIVED"] as const;

export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

export interface Customer {
  id: string;
  tenant_id: string;
  full_name: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  photo_key: string | null;
  status: CustomerStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CustomerContactInput {
  full_name: string;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
}

export interface NormalizedContact {
  full_name: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
}

export type ContactErrors = Partial<
  Record<keyof NormalizedContact, string>
> & { generic?: string };

export interface ValidationFailure {
  ok: false;
  errors: ContactErrors;
}

export interface ValidationSuccess {
  ok: true;
  value: NormalizedContact;
}

export type NormalizeResult = ValidationSuccess | ValidationFailure;

export const FULL_NAME_MAX = 120;
export const EMAIL_MAX = 254;
export const ADDRESS_MAX = 300;
export const NOTES_MAX = 2000;

export function normalizeFullName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizePhone(value: string): string {
  return value.replace(/[\s.\-()]/g, "");
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function keyForSearch(customer: Pick<Customer, "full_name" | "phone">): string {
  return [customer.full_name, customer.phone ?? ""]
    .join(" ")
    .toLowerCase();
}

export function matchesSearch(
  customer: Pick<Customer, "full_name" | "phone">,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return true;
  return keyForSearch(customer).includes(q);
}

export function isPlainText(v: string): boolean {
  return !/[\r\n\t]/.test(v);
}

export function validEmail(v: string): boolean {
  if (v.length > EMAIL_MAX) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}

export function normalizeContact(
  input: CustomerContactInput,
): NormalizeResult {
  const errors: ContactErrors = {};

  const full_name = normalizeFullName(input.full_name);
  if (full_name.length < 2 || full_name.length > FULL_NAME_MAX) {
    errors.full_name = "Le nom doit contenir entre 2 et 120 caractères.";
  }

  const phone = input.phone && input.phone.trim() !== "" ? normalizePhone(input.phone) : null;
  if (phone !== null) {
    if (!/^\+?\d{9,15}$/.test(phone)) {
      errors.phone = "Numéro de téléphone invalide (9 à 15 chiffres).";
    }
  }

  const whatsapp =
    input.whatsapp && input.whatsapp.trim() !== "" ? normalizePhone(input.whatsapp) : null;
  if (whatsapp !== null && !/^\+?\d{9,15}$/.test(whatsapp)) {
    errors.whatsapp = "Numéro WhatsApp invalide.";
  }

  const email = input.email && input.email.trim() !== "" ? normalizeEmail(input.email) : null;
  if (email !== null && !validEmail(email)) {
    errors.email = "Adresse e-mail invalide.";
  }

  const address = input.address && input.address.trim() !== "" ? input.address.trim() : null;
  const notes = input.notes && input.notes.trim() !== "" ? input.notes.trim() : null;

  if (address !== null) {
    if (address.length > ADDRESS_MAX) errors.address = "Adresse trop longue.";
    if (!isPlainText(address)) errors.address = "Adresse invalide.";
  }
  if (notes !== null) {
    if (notes.length > NOTES_MAX) errors.notes = "Note trop longue.";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: { full_name, phone, whatsapp, email, address, notes },
  };
}

export function archiveCustomer(customer: Customer, now: string): Customer {
  return { ...customer, status: "ARCHIVED", updated_at: now };
}

export function isActive(customer: Pick<Customer, "status">): boolean {
  return customer.status === "ACTIVE";
}

export function samePhoneWithinTenant(
  a: Pick<Customer, "phone" | "status">,
  b: Pick<Customer, "phone" | "status">,
): boolean {
  if (a.phone === null || b.phone === null) return false;
  if (a.status === "ARCHIVED" || b.status === "ARCHIVED") return false;
  return a.phone === b.phone;
}