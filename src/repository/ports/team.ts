import type { TeamMemberRecord } from "@/domain/team/teamMember";

export interface TeamMembersRepository {
  listAll(): Promise<TeamMemberRecord[]>;
  getMember(id: string): Promise<TeamMemberRecord | null>;
  saveMember(member: TeamMemberRecord): Promise<void>;
}