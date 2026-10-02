import type { SupabaseClient } from "@supabase/supabase-js";
import type { TenantRoleCode } from "@/domain/team/roles";
import type {
  CreatedInvitation,
  InvitableRole,
  InvitationStatus,
  PublicInvitation,
  TeamSnapshot,
} from "@/domain/team/invitations";

/**
 * Accès serveur à l'équipe (RPC de 0017). Action en ligne : l'invitation
 * et la gestion des membres exigent le réseau (pas de file offline).
 * Chaque méthode lève une Error dont le message est le code SQL levé.
 */
export interface TeamRemote {
  listTeam(): Promise<TeamSnapshot>;
  createInvitation(email: string, role: InvitableRole): Promise<CreatedInvitation>;
  revokeInvitation(id: string): Promise<void>;
  setMemberRole(membershipId: string, role: TenantRoleCode): Promise<void>;
  setMemberStatus(membershipId: string, status: "ACTIVE" | "DEACTIVATED"): Promise<void>;
  getInvitation(token: string): Promise<PublicInvitation>;
  acceptInvitation(token: string): Promise<string>;
}

type Row = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export function createTeamRemote(client: SupabaseClient): TeamRemote {
  return {
    async listTeam() {
      const { data, error } = await client.rpc("list_team");
      fail(error);
      const payload = (data ?? {}) as Row;
      const members = Array.isArray(payload.members) ? (payload.members as Row[]) : [];
      const invitations = Array.isArray(payload.invitations) ? (payload.invitations as Row[]) : [];
      return {
        canManage: payload.can_manage === true,
        members: members.map((m) => ({
          id: String(m.id),
          profileId: String(m.profile_id),
          fullName: str(m.full_name) ?? "—",
          email: str(m.email),
          role: String(m.role) as TenantRoleCode,
          status: String(m.status) as "INVITED" | "ACTIVE" | "DEACTIVATED",
          joinedAt: str(m.joined_at),
          isSelf: m.is_self === true,
        })),
        invitations: invitations.map((i) => ({
          id: String(i.id),
          email: String(i.email),
          role: String(i.role) as TenantRoleCode,
          expiresAt: String(i.expires_at),
          createdAt: String(i.created_at),
        })),
      };
    },

    async createInvitation(email, role) {
      const { data, error } = await client.rpc("create_invitation", { p_email: email, p_role: role });
      fail(error);
      const row = (data ?? {}) as Row;
      return {
        id: String(row.id),
        token: String(row.token),
        email: String(row.email),
        role: String(row.role) as InvitableRole,
        expiresAt: String(row.expires_at),
      };
    },

    async revokeInvitation(id) {
      const { error } = await client.rpc("revoke_invitation", { p_id: id });
      fail(error);
    },

    async setMemberRole(membershipId, role) {
      const { error } = await client.rpc("set_member_role", { p_membership: membershipId, p_role: role });
      fail(error);
    },

    async setMemberStatus(membershipId, status) {
      const { error } = await client.rpc("set_member_status", { p_membership: membershipId, p_status: status });
      fail(error);
    },

    async getInvitation(token) {
      const { data, error } = await client.rpc("get_invitation", { p_token: token });
      fail(error);
      const row = (data ?? {}) as Row;
      return {
        status: (str(row.status) ?? "NOT_FOUND") as InvitationStatus,
        tenantName: str(row.tenant_name),
        role: (str(row.role) as TenantRoleCode | null) ?? null,
        email: str(row.email),
        invitedBy: str(row.invited_by),
        expiresAt: str(row.expires_at),
      };
    },

    async acceptInvitation(token) {
      const { data, error } = await client.rpc("accept_invitation", { p_token: token });
      fail(error);
      return String(data);
    },
  };
}
