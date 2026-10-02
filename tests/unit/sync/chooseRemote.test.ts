import { describe, expect, it, vi, afterEach } from "vitest";
import { createRemoteSync } from "@/infrastructure/sync/chooseRemote";

describe("createRemoteSync", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("retourne le stub EXPLICITE (pas un faux backend) sans env Supabase", async () => {
    const remote = createRemoteSync();
    await expect(remote.push({ batch: [] })).rejects.toThrow(
      "REMOTE_SYNC_NOT_PROVISIONED",
    );
  });

  it("provisionné sans session : n'envoie rien et laisse le lot en file", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "pk_anon");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const remote = createRemoteSync();

    await expect(remote.push({ batch: [] })).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHENTICATED",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});