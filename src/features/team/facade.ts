import type { TeamService } from "@/application/team/teamService";
import { createTeamService } from "@/application/team/teamService";
import { getClientsFacade } from "@/features/clients/facade";
import { makeLocalTeamRepository } from "@/repository/local/team";
import { createIndexedDbCache } from "@/repository/local/indexeddb/cache";
import { TEAM_DEMO_PROFILE_ID, TEAM_DEMO_TENANT_ID } from "./constants";

export interface TeamFacade {
  team: TeamService;
}

export function createTeamFacade(input: {
  tenantId: string;
  profileId: string;
}): TeamFacade {
  const clientsFacade = getClientsFacade();
  const cache = createIndexedDbCache(input.tenantId);

  const team = createTeamService({
    tenantId: input.tenantId,
    profileId: input.profileId,
    members: makeLocalTeamRepository(cache),
    engine: clientsFacade.engine,
  });

  return { team };
}

let singleton: TeamFacade | null = null;

export function getTeamFacade(): TeamFacade {
  if (typeof window === "undefined") {
    throw new Error("TEAM_FACADE_SERVER_SIDE");
  }
  if (singleton === null) {
    singleton = createTeamFacade({
      tenantId: TEAM_DEMO_TENANT_ID,
      profileId: TEAM_DEMO_PROFILE_ID,
    });
  }
  return singleton;
}