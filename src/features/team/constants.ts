import type { BadgeTone } from "@/ui";
import type { TenantRoleCode } from "@/domain/team/roles";
import {
  ROLE_LABELS,
  TENANT_ROLE_CODES,
} from "@/domain/team/roles";
import type { MembershipStatus } from "@/domain/team/teamMember";

export const ROLE_META: Record<TenantRoleCode, { label: string; tone: BadgeTone }> = {
  OWNER: { label: ROLE_LABELS.OWNER, tone: "danger" },
  MANAGER: { label: ROLE_LABELS.MANAGER, tone: "accent" },
  EMPLOYEE: { label: ROLE_LABELS.EMPLOYEE, tone: "primary" },
  APPRENTICE: { label: ROLE_LABELS.APPRENTICE, tone: "neutral" },
};

export const ROLE_OPTIONS: TenantRoleCode[] = [...TENANT_ROLE_CODES];

export const MEMBERSHIP_STATUS_META: Record<
  MembershipStatus,
  { label: string; tone: BadgeTone }
> = {
  INVITED: { label: "Invitée", tone: "warning" },
  ACTIVE: { label: "Active", tone: "success" },
  DEACTIVATED: { label: "Désactivée", tone: "neutral" },
};