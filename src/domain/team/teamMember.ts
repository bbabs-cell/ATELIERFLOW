import { normalizeFullName, normalizePhone } from "@/domain/clients/customer";
import { TENANT_ROLE_CODES } from "@/domain/team/roles";
import type { TenantRoleCode } from "@/domain/team/roles";

export const MEMBERSHIP_STATUSES = ["INVITED", "ACTIVE", "DEACTIVATED"] as const;

export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export interface TeamMemberRecord {
  id: string;
  tenant_id: string;
  full_name: string;
  phone: string | null;
  role: TenantRoleCode;
  status: MembershipStatus;
  invited_by: string | null;
  joined_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface InviteMemberDraftInput {
  fullName: string;
  phone?: string | null;
  role: string;
}

export interface InviteMemberDraftClean {
  fullName: string;
  phone: string | null;
  role: TenantRoleCode;
}

export type InviteMemberDraftErrors = Partial<
  Record<"fullName" | "phone" | "role", string>
>;

export function validateInviteMemberDraft(
  input: InviteMemberDraftInput,
): { value: InviteMemberDraftClean; errors: InviteMemberDraftErrors } {
  const errors: InviteMemberDraftErrors = {};
  const fullName = normalizeFullName(input.fullName);
  if (fullName.length < 2 || fullName.length > 120) {
    errors.fullName = "Le nom doit contenir entre 2 et 120 caractères.";
  }
  let phone: string | null = null;
  if (input.phone !== undefined && input.phone !== null && input.phone.trim() !== "") {
    const normalized = normalizePhone(input.phone);
    if (normalized === null || !/^\+?\d{9,15}$/.test(normalized)) {
      errors.phone = "Numéro de téléphone invalide (9 à 15 chiffres).";
    } else {
      phone = normalized;
    }
  }
  if (!TENANT_ROLE_CODES.includes(input.role as TenantRoleCode)) {
    errors.role = "Rôle invalide.";
  }
  return {
    value: {
      fullName,
      phone,
      role: input.role as TenantRoleCode,
    },
    errors,
  };
}

export interface RoleChangeContext {
  member: TeamMemberRecord;
  operatorId: string;
  targetRole: TenantRoleCode;
  activeOwnersBesidesThis: number;
}

export interface StatusChangeContext {
  member: TeamMemberRecord;
  operatorId: string;
  activeOwnersBesidesThis: number;
}

/** Miroir du trigger `tenant_memberships_rules()` (0007) côté service. */
export function validateRoleChange(
  ctx: RoleChangeContext,
): { ok: true } | { ok: false; reason: string } {
  if (ctx.member.id === ctx.operatorId) {
    return { ok: false, reason: "Un membre ne peut pas changer son propre rôle." };
  }
  if (
    ctx.member.status === "ACTIVE" &&
    ctx.member.role === "OWNER" &&
    ctx.targetRole !== "OWNER" &&
    ctx.activeOwnersBesidesThis === 0
  ) {
    return { ok: false, reason: "Au moins un OWNER actif est requis." };
  }
  return { ok: true };
}

/** Toute désactivation est interdite sur soi et sur le dernier OWNER actif. */
export function validateDeactivation(
  ctx: StatusChangeContext,
): { ok: true } | { ok: false; reason: string } {
  if (ctx.member.id === ctx.operatorId) {
    return { ok: false, reason: "Un membre ne peut pas se désactiver lui-même." };
  }
  if (
    ctx.member.status === "ACTIVE" &&
    ctx.member.role === "OWNER" &&
    ctx.activeOwnersBesidesThis === 0
  ) {
    return { ok: false, reason: "Au moins un OWNER actif est requis." };
  }
  return { ok: true };
}

/** Sur soi, seule la transition INVITED → ACTIVE est possible (miroir trigger). */
export function validateOwnStatusTransition(
  current: MembershipStatus,
  next: MembershipStatus,
): { ok: true } | { ok: false; reason: string } {
  if (current === "INVITED" && next === "ACTIVE") return { ok: true };
  if (current === next) return { ok: true };
  return { ok: false, reason: "Statut introuvable ou transition interdite." };
}