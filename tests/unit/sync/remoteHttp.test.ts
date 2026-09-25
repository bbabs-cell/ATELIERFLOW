import { describe, expect, it, vi } from "vitest";
import { createHttpRemoteSync, SyncHttpError } from "@/infrastructure/sync/remoteHttp";

const OK = () =>
  new Response(JSON.stringify({ results: [] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

describe("createHttpRemoteSync", () => {
  it("transmet le jeton de session en Authorization: Bearer", async () => {
    const fetchImpl = vi.fn(async () => OK());
    const remote = createHttpRemoteSync({
      fetchImpl,
      getAccessToken: async () => "jwt-123",
    });

    await remote.push({ batch: [] });

    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/sync",
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: "Bearer jwt-123" }),
      }),
    );
  });

  it("sans jeton : lève 401 sans appel réseau (le moteur requeue)", async () => {
    const fetchImpl = vi.fn(async () => OK());
    const remote = createHttpRemoteSync({ fetchImpl, getAccessToken: async () => null });

    const error = await remote.push({ batch: [] }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SyncHttpError);
    expect(error).toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sans fournisseur de jeton : pas d'en-tête Authorization", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => OK());
    await createHttpRemoteSync({ fetchImpl }).push({ batch: [] });
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    expect(init.headers).not.toHaveProperty("authorization");
  });
});
