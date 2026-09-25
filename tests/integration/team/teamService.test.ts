import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { createTeamService } from "@/application/team/teamService";
import { SyncEngine } from "@/application/sync/engine";
import { createIndexedDbCache } from "@/repository/local/indexeddb/cache";
import { createIndexedDbQueue } from "@/repository/local/indexeddb/queue";
import { makeLocalTeamRepository } from "@/repository/local/team";
import { createFakeSyncServer } from "../../support/fakeSyncServer";

let tenantSeq = 0;
const uniqueTenant = () =>
  `00000000-0000-4000-8000-00000000${(tenantSeq += 1).toString(16).padStart(8, "0")}`;

const OWNER = "20000000-0000-4000-8000-000000000001";

function makeHarness(tenantId: string = uniqueTenant()) {
  const queue = createIndexedDbQueue(tenantId);
  const cache = createIndexedDbCache(tenantId);
  const server = createFakeSyncServer();
  const repo = makeLocalTeamRepository(cache);
  let t = 1_767_225_599_000;
  const now = () => new Date((t += 1_000)).toISOString();
  let n = 1;
  const uuid = () => `20000000-0000-4000-8000-${(n += 1).toString(16).padStart(12, "0")}`;
  const engine = new SyncEngine({
    queue,
    cache,
    remote: server,
    now: () => t,
    uuid: () => `30000000-0000-4000-8000-${(n += 1).toString(16).padStart(12, "0")}`,
  });
  const team = createTeamService({ tenantId, profileId: OWNER, members: repo, engine, now, uuid });
  return { cache, server, engine, repo, team, tenantId };
}

async function seedOwner(h: ReturnType<typeof makeHarness>) {
  await h.repo.saveMember({
    id: OWNER,
    tenant_id: h.tenantId,
    full_name: "Awa Diop",
    phone: "+221771112233",
    role: "OWNER",
    status: "ACTIVE",
    invited_by: null,
    joined_at: "2026-01-01T08:00:00.000Z",
    created_at: "2026-01-01T08:00:00.000Z",
    updated_at: "2026-01-01T08:00:00.000Z",
  });
}

describe("createTeamService", () => {
  it("invite un membre puis accepte INVITED → ACTIVE", async () => {
    const h = makeHarness();
    await seedOwner(h);

    const invited = await h.team.inviteMember({
      fullName: "Sita Ndiaye",
      phone: "+221 77 123 45 67",
      role: "EMPLOYEE",
    });
    expect(invited.ok).toBe(true);
    if (!invited.ok) return;
    expect(invited.member.status).toBe("INVITED");
    expect(invited.member.role).toBe("EMPLOYEE");
    expect(invited.member.invited_by).toBe(OWNER);

    const accepted = await h.team.acceptInvite(invited.member.id);
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(accepted.member.status).toBe("ACTIVE");
    expect(accepted.member.joined_at).not.toBeNull();

    const actors = await h.team.listMembers();
    expect(actors).toHaveLength(2);
  });

  it("expose l'accès courant (rôle + permissions)", async () => {
    const h = makeHarness();
    await seedOwner(h);
    const access = await h.team.currentAccess();
    expect(access.role).toBe("OWNER");
    expect(access.canManageTeam).toBe(true);
    expect(access.permissions).toContain("team.manage");
  });

  it("refuse d'inviter sans permission team.manage", async () => {
    const h = makeHarness();
    // l'opérateur est un EMPLOYEE (pas de team.manage)
    await h.repo.saveMember({
      id: OWNER,
      tenant_id: "t",
      full_name: "Employé",
      phone: null,
      role: "EMPLOYEE",
      status: "ACTIVE",
      invited_by: null,
      joined_at: null,
      created_at: "2026-01-01T08:00:00.000Z",
      updated_at: "2026-01-01T08:00:00.000Z",
    });
    const result = await h.team.inviteMember({
      fullName: "Sita Ndiaye",
      role: "EMPLOYEE",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("FORBIDDEN");
  });

  it("ne peut ni changer son rôle ni se désactiver ; co-OWNER préservé", async () => {
    const h = makeHarness();
    await seedOwner(h);

    const selfDemote = await h.team.setRole(OWNER, "MANAGER");
    expect(selfDemote.ok).toBe(false);
    if (!selfDemote.ok) expect(selfDemote.reason).toContain("propre rôle");

    const selfDeactivate = await h.team.deactivateMember(OWNER);
    expect(selfDeactivate.ok).toBe(false);
    if (!selfDeactivate.ok) expect(selfDeactivate.reason).toContain("lui-même");

    const co = await h.team.inviteMember({ fullName: "Co-Owner", role: "OWNER" });
    if (!co.ok) return;
    await h.team.acceptInvite(co.member.id);

    const demoteCo = await h.team.setRole(co.member.id, "EMPLOYEE");
    expect(demoteCo.ok).toBe(true);
    if (demoteCo.ok) expect(demoteCo.member.role).toBe("EMPLOYEE");

    const stillOwner = await h.team.reactivateMember(co.member.id);
    expect(stillOwner.ok).toBe(true);

    const demoteManager = await h.team.setRole(co.member.id, "OWNER");
    expect(demoteManager.ok).toBe(true);
  });

  it("désactive et réactive un membre (aucune suppression)", async () => {
    const h = makeHarness();
    await seedOwner(h);

    const invited = await h.team.inviteMember({ fullName: "Camille", role: "EMPLOYEE" });
    if (!invited.ok) return;
    await h.team.acceptInvite(invited.member.id);

    const deactivated = await h.team.deactivateMember(invited.member.id);
    expect(deactivated.ok).toBe(true);
    if (!deactivated.ok) return;
    expect(deactivated.member.status).toBe("DEACTIVATED");

    const reactivated = await h.team.reactivateMember(invited.member.id);
    expect(reactivated.ok).toBe(true);
    if (reactivated.ok) expect(reactivated.member.status).toBe("ACTIVE");
  });

  it("pousse les membres une seule fois (flush idempotent)", async () => {
    const h = makeHarness();
    await seedOwner(h);
    await h.team.inviteMember({ fullName: "Sita", role: "APPRENTICE" });

    const report = await h.engine.flush();
    expect(report.networkError).toBeNull();
    const pushed = h.server.pushed().filter((op) => op.entity === "team_members");
    expect(pushed).toHaveLength(1);
    expect(pushed[0].operation).toBe("INSERT");

    expect(await h.engine.flush()).toMatchObject({ synced: 0, attempted: 0 });
  });
});