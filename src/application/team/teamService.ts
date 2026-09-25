import { SyncEngine } from "@/application/sync/engine";
import { newIdempotencyKey } from "@/domain/ids/idempotency";
import { can, permissionsFor } from "@/domain/team/roles";
import type { PermissionCode, TenantRoleCode } from "@/domain/team/roles";
import {
  validateDeactivation,
  validateInviteMemberDraft,
  validateOwnStatusTransition,
  validateRoleChange,
} from "@/domain/team/teamMember";
import type {
  InviteMemberDraftErrors,
  InviteMemberDraftInput,
  TeamMemberRecord,
} from "@/domain/team/teamMember";
import type { TeamMembersRepository } from "@/repository/ports/team";

const TEAM_ENTITY = "team_members";

export interface CurrentMemberAccess {
  memberId: string;
  role: TenantRoleCode;
  permissions: PermissionCode[];
  canManageTeam: boolean;
}

export type InviteMemberResult =
  | { ok: true; member: TeamMemberRecord }
  | { ok: false; errors: InviteMemberDraftErrors | null; reason: string | null };

export type MemberActionResult =
  | { ok: true; member: TeamMemberRecord }
  | { ok: false; reason: string };

export interface TeamService {
  listMembers(): Promise<TeamMemberRecord[]>;
  currentAccess(): Promise<CurrentMemberAccess>;
  inviteMember(input: InviteMemberDraftInput): Promise<InviteMemberResult>;
  acceptInvite(memberId: string): Promise<MemberActionResult>;
  setRole(memberId: string, role: TenantRoleCode): Promise<MemberActionResult>;
  deactivateMember(memberId: string): Promise<MemberActionResult>;
  reactivateMember(memberId: string): Promise<MemberActionResult>;
}

export interface TeamServiceDeps {
  tenantId: string;
  profileId: string;
  members: TeamMembersRepository;
  engine: SyncEngine;
  now?: () => string;
  uuid?: () => string;
}

export function createTeamService(deps: TeamServiceDeps): TeamService {
  const now = deps.now ?? (() => new Date().toISOString());
  const port =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto
      : undefined;
  const uuid = deps.uuid ?? (() => port?.randomUUID() ?? newIdempotencyKey());

  async function enqueue(member: TeamMemberRecord) {
    await deps.engine.enqueue({
      tenantId: deps.tenantId,
      profileId: deps.profileId,
      entity: TEAM_ENTITY,
      entityId: member.id,
      operation: "INSERT",
      payload: member,
    });
  }

  async function activeOwnersBesides(memberId: string): Promise<number> {
    const members = await deps.members.listAll();
    return members.filter(
      (m) => m.id !== memberId && m.status === "ACTIVE" && m.role === "OWNER",
    ).length;
  }

  async function currentAccess(): Promise<CurrentMemberAccess> {
    const me = await deps.members.getMember(deps.profileId);
    const role: TenantRoleCode = me === null ? "OWNER" : me.role;
    return {
      memberId: deps.profileId,
      role,
      permissions: permissionsFor(role),
      canManageTeam: can(role, "team.manage"),
    };
  }

  return {
    async listMembers() {
      return deps.members.listAll();
    },
    async currentAccess() {
      const me = await deps.members.getMember(deps.profileId);
      const role: TenantRoleCode = me === null ? "OWNER" : me.role;
      return {
        memberId: deps.profileId,
        role,
        permissions: permissionsFor(role),
        canManageTeam: can(role, "team.manage"),
      };
    },
    async inviteMember(input) {
      const draft = validateInviteMemberDraft(input);
      if (Object.keys(draft.errors).length > 0) {
        return { ok: false, errors: draft.errors, reason: null };
      }
      const access = await currentAccess();
      if (!access.canManageTeam) {
        return {
          ok: false,
          errors: { role: "Invitation refusée : permission team.manage requise." },
          reason: "FORBIDDEN",
        };
      }
      const member: TeamMemberRecord = {
        id: uuid(),
        tenant_id: deps.tenantId,
        full_name: draft.value.fullName,
        phone: draft.value.phone,
        role: draft.value.role,
        status: "INVITED",
        invited_by: deps.profileId,
        joined_at: null,
        created_at: now(),
        updated_at: now(),
      };
      await deps.members.saveMember(member);
      await enqueue(member);
      return { ok: true, member };
    },
    async acceptInvite(memberId) {
      const member = await deps.members.getMember(memberId);
      if (member === null) {
        return { ok: false, reason: "Invitation introuvable." };
      }
      const transition = validateOwnStatusTransition(member.status, "ACTIVE");
      if (!transition.ok) {
        return { ok: false, reason: transition.reason };
      }
      const updated: TeamMemberRecord = {
        ...member,
        status: "ACTIVE",
        joined_at: now(),
        updated_at: now(),
      };
      await deps.members.saveMember(updated);
      await enqueue(updated);
      return { ok: true, member: updated };
    },
    async setRole(memberId, role) {
      const access = await currentAccess();
      if (!access.canManageTeam) {
        return { ok: false, reason: "FORBIDDEN" };
      }
      const member = await deps.members.getMember(memberId);
      if (member === null) {
        return { ok: false, reason: "Membre introuvable." };
      }
      if (member.role === role) {
        return { ok: true, member };
      }
      const guard = validateRoleChange({
        member,
        operatorId: deps.profileId,
        targetRole: role,
        activeOwnersBesidesThis: await activeOwnersBesides(memberId),
      });
      if (!guard.ok) {
        return { ok: false, reason: guard.reason };
      }
      const updated: TeamMemberRecord = {
        ...member,
        role,
        updated_at: now(),
      };
      await deps.members.saveMember(updated);
      await enqueue(updated);
      return { ok: true, member: updated };
    },
    async deactivateMember(memberId) {
      const access = await currentAccess();
      if (!access.canManageTeam) {
        return { ok: false, reason: "FORBIDDEN" };
      }
      const member = await deps.members.getMember(memberId);
      if (member === null) {
        return { ok: false, reason: "Membre introuvable." };
      }
      if (member.status === "DEACTIVATED") {
        return { ok: true, member };
      }
      const guard = validateDeactivation({
        member,
        operatorId: deps.profileId,
        activeOwnersBesidesThis: await activeOwnersBesides(memberId),
      });
      if (!guard.ok) {
        return { ok: false, reason: guard.reason };
      }
      const updated: TeamMemberRecord = {
        ...member,
        status: "DEACTIVATED",
        updated_at: now(),
      };
      await deps.members.saveMember(updated);
      await enqueue(updated);
      return { ok: true, member: updated };
    },
    async reactivateMember(memberId) {
      const access = await currentAccess();
      if (!access.canManageTeam) {
        return { ok: false, reason: "FORBIDDEN" };
      }
      const member = await deps.members.getMember(memberId);
      if (member === null) {
        return { ok: false, reason: "Membre introuvable." };
      }
      if (member.status === "INVITED") {
        return { ok: false, reason: "L'invité doit accepter l'invitation." };
      }
      if (member.status !== "DEACTIVATED") {
        return { ok: true, member };
      }
      const updated: TeamMemberRecord = {
        ...member,
        status: "ACTIVE",
        updated_at: now(),
      };
      await deps.members.saveMember(updated);
      await enqueue(updated);
      return { ok: true, member: updated };
    },
  };
}
