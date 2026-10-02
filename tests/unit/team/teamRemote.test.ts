import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createTeamRemote } from "@/infrastructure/team/teamRemote";

function fakeClient(responses: Record<string, { data?: unknown; error?: { message: string } | null }>) {
  const rpc = vi.fn(async (name: string) => responses[name] ?? { data: null, error: null });
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

describe("createTeamRemote", () => {
  it("appelle create_invitation avec les bons paramètres et mappe la réponse", async () => {
    const { client, rpc } = fakeClient({
      create_invitation: {
        data: { id: "i1", token: "tok", email: "b@a.sn", role: "EMPLOYEE", expires_at: "2026-10-09T00:00:00Z" },
        error: null,
      },
    });
    const created = await createTeamRemote(client).createInvitation("b@a.sn", "EMPLOYEE");
    expect(rpc).toHaveBeenCalledWith("create_invitation", { p_email: "b@a.sn", p_role: "EMPLOYEE" });
    expect(created).toEqual({ id: "i1", token: "tok", email: "b@a.sn", role: "EMPLOYEE", expiresAt: "2026-10-09T00:00:00Z" });
  });

  it("mappe list_team (membres + invitations)", async () => {
    const { client } = fakeClient({
      list_team: {
        data: {
          can_manage: true,
          members: [{ id: "m1", profile_id: "p1", full_name: "Awa", email: "awa@a.sn", role: "OWNER", status: "ACTIVE", joined_at: null, is_self: true }],
          invitations: [{ id: "i1", email: "b@a.sn", role: "EMPLOYEE", expires_at: "x", created_at: "y" }],
        },
      },
    });
    const team = await createTeamRemote(client).listTeam();
    expect(team.canManage).toBe(true);
    expect(team.members[0]).toMatchObject({ id: "m1", fullName: "Awa", role: "OWNER", isSelf: true });
    expect(team.invitations[0]).toMatchObject({ id: "i1", email: "b@a.sn" });
  });

  it("propage le code d'erreur SQL tel quel", async () => {
    const { client } = fakeClient({ accept_invitation: { data: null, error: { message: "EMAIL_MISMATCH" } } });
    await expect(createTeamRemote(client).acceptInvitation("t")).rejects.toThrow("EMAIL_MISMATCH");
  });

  it("invitation inconnue → NOT_FOUND", async () => {
    const { client } = fakeClient({ get_invitation: { data: { status: "NOT_FOUND" } } });
    expect((await createTeamRemote(client).getInvitation("x")).status).toBe("NOT_FOUND");
  });
});
