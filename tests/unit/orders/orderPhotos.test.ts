import { afterEach, describe, expect, it, vi } from "vitest";

const uploadFile = vi.fn();
vi.mock("@/infrastructure/files/filesClient", () => ({
  uploadFile: (...args: unknown[]) => uploadFile(...args),
  compressPhoto: async (f: File) => f,
  FilesClientError: class FilesClientError extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  },
}));

const { FilesClientError } = await import("@/infrastructure/files/filesClient");
const { uploadOrderPhotos, MAX_ORDER_FORM_PHOTOS } = await import("@/features/orders/orderPhotos");

const photo = (name: string) => new File([new Uint8Array([0xff, 0xd8, 0xff])], name, { type: "image/jpeg" });

afterEach(() => {
  uploadFile.mockReset();
  vi.useRealTimers();
});

describe("photos du tissu à la création de la commande", () => {
  it("attend que le serveur connaisse la commande, puis envoie", async () => {
    vi.useFakeTimers();
    uploadFile
      .mockRejectedValueOnce(new FilesClientError("NOT_FOUND:orders"))
      .mockRejectedValueOnce(new FilesClientError("NOT_FOUND:orders"))
      .mockResolvedValue({ id: "f1" });
    const pending = uploadOrderPhotos("o1", [photo("tissu.jpg")]);
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toEqual({ sent: 1, failed: 0 });
    expect(uploadFile).toHaveBeenCalledTimes(3);
    expect(uploadFile).toHaveBeenLastCalledWith("ORDER", "o1", expect.any(File), "tissu.jpg");
  });

  it("n'insiste pas sur une erreur définitive (quota, droits)", async () => {
    uploadFile.mockRejectedValue(new FilesClientError("PLAN_LIMIT:storage"));
    await expect(uploadOrderPhotos("o1", [photo("a.jpg")])).resolves.toEqual({ sent: 0, failed: 1 });
    expect(uploadFile).toHaveBeenCalledTimes(1);
  });

  it(`au plus ${MAX_ORDER_FORM_PHOTOS} photos`, async () => {
    uploadFile.mockResolvedValue({ id: "f" });
    const files = Array.from({ length: 6 }, (_, i) => photo(`p${i}.jpg`));
    await expect(uploadOrderPhotos("o1", files)).resolves.toEqual({ sent: MAX_ORDER_FORM_PHOTOS, failed: 0 });
  });

  it("abandonne après plusieurs essais si la commande n'arrive jamais", async () => {
    vi.useFakeTimers();
    uploadFile.mockRejectedValue(new FilesClientError("NOT_FOUND:orders"));
    const pending = uploadOrderPhotos("o1", [photo("a.jpg")]);
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toEqual({ sent: 0, failed: 1 });
    expect(uploadFile).toHaveBeenCalledTimes(7);
  });
});
