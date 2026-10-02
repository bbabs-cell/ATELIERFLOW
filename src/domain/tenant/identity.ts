import type { AtelierIdentity } from "@/domain/orders/receiptDocument";

/**
 * Coordonnées de l'atelier imprimées sur les reçus : `tenants.name` et
 * `tenants.settings.receipt` ({ phone, address, footer }). Modifiables
 * par qui détient `tenant.settings` (RLS tenants_update_settings).
 */

export const IDENTITY_LIMITS = { name: 80, phone: 30, address: 120, footer: 200 } as const;

function clean(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed === "" ? null : trimmed.slice(0, max);
}

export function identityFromTenant(row: { name?: unknown; settings?: unknown } | null): AtelierIdentity {
  const settings = row?.settings && typeof row.settings === "object" ? (row.settings as Record<string, unknown>) : {};
  const receipt = settings.receipt && typeof settings.receipt === "object" ? (settings.receipt as Record<string, unknown>) : {};
  return {
    name: clean(row?.name, IDENTITY_LIMITS.name) ?? "Mon atelier",
    phone: clean(receipt.phone, IDENTITY_LIMITS.phone),
    address: clean(receipt.address, IDENTITY_LIMITS.address),
    footer: clean(receipt.footer, IDENTITY_LIMITS.footer),
  };
}

export type IdentityErrors = Partial<Record<keyof AtelierIdentity, string>>;

export function validateIdentity(draft: AtelierIdentity): { ok: true; value: AtelierIdentity } | { ok: false; errors: IdentityErrors } {
  const errors: IdentityErrors = {};
  const name = draft.name.trim().replace(/\s+/g, " ");
  if (name.length < 2) errors.name = "Le nom de l'atelier est obligatoire.";
  else if (name.length > IDENTITY_LIMITS.name) errors.name = `${IDENTITY_LIMITS.name} caractères au maximum.`;
  for (const key of ["phone", "address", "footer"] as const) {
    const value = draft[key]?.trim() ?? "";
    if (value.length > IDENTITY_LIMITS[key]) errors[key] = `${IDENTITY_LIMITS[key]} caractères au maximum.`;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name,
      phone: clean(draft.phone, IDENTITY_LIMITS.phone),
      address: clean(draft.address, IDENTITY_LIMITS.address),
      footer: clean(draft.footer, IDENTITY_LIMITS.footer),
    },
  };
}

/** Fusionne les coordonnées dans `settings` sans toucher aux autres clés. */
export function mergeReceiptSettings(settings: unknown, identity: AtelierIdentity): Record<string, unknown> {
  const base = settings && typeof settings === "object" && !Array.isArray(settings) ? { ...(settings as Record<string, unknown>) } : {};
  base.receipt = { phone: identity.phone, address: identity.address, footer: identity.footer };
  return base;
}
