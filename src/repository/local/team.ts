import type { TeamMemberRecord } from "@/domain/team/teamMember";
import type { LocalCachePort } from "@/repository/ports/sync";
import type { TeamMembersRepository } from "@/repository/ports/team";

const TEAM_ENTITY = "team_members";

function asEntity<T>(records: unknown[]): T[] {
  return records as T[];
}

export function makeLocalTeamRepository(cache: LocalCachePort): TeamMembersRepository {
  async function listAll(): Promise<TeamMemberRecord[]> {
    const records = asEntity<TeamMemberRecord>(await cache.list(TEAM_ENTITY));
    return records.sort((a, b) => {
      const byStatus = Number(b.status === "ACTIVE") - Number(a.status === "ACTIVE");
      if (byStatus !== 0) return byStatus;
      return a.full_name.localeCompare(b.full_name, "fr");
    });
  }

  async function getMember(id: string): Promise<TeamMemberRecord | null> {
    return (await cache.get(TEAM_ENTITY, id)) as TeamMemberRecord | null;
  }

  async function saveMember(member: TeamMemberRecord): Promise<void> {
    await cache.put(TEAM_ENTITY, member.id, member);
  }

  return { listAll, getMember, saveMember };
}