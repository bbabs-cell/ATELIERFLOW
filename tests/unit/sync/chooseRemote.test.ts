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

  it("retourne le transport HTTP réel quand Supabase est provisionné", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "pk_anon");

    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ error: { code: "SYNC_ENDPOINT_NOT_PROVISIONED" } }),
        { status: 501 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const remote = createRemoteSync();
    const promise = remote.push({ batch: [] });

    await expect(promise).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sync",
      expect.objectContaining({ method: "POST" }),
    );
  });
});