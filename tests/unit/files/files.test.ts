import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkUpload,
  fileErrorMessage,
  keyBelongsToTenant,
  objectKey,
  sniffMime,
  type FileRecord,
} from "@/domain/files/files";
import { createFileService, dbErrorCode, FileServiceError, statusForCode, type FilesDb } from "@/infrastructure/files/fileService";
import { createR2Storage, getR2Env, type R2Storage } from "@/infrastructure/files/r2";

const T = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const E = "33333333-3333-4333-8333-333333333333";
const F = "44444444-4444-4444-8444-444444444444";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
const PDF = new TextEncoder().encode("%PDF-1.7\n...");
const EXE = new Uint8Array([0x4d, 0x5a, 0x90, 0]);

describe("types réels et contrôles", () => {
  it("reconnaît le type par signature, pas par le nom", () => {
    expect(sniffMime(JPEG)).toBe("image/jpeg");
    expect(sniffMime(PNG)).toBe("image/png");
    expect(sniffMime(WEBP)).toBe("image/webp");
    expect(sniffMime(PDF)).toBe("application/pdf");
    expect(sniffMime(EXE)).toBeNull();
    expect(sniffMime(new TextEncoder().encode("<svg>"))).toBeNull();
  });

  it("photos pour les fiches, PDF pour les reçus, tailles bornées", () => {
    expect(checkUpload("CUSTOMER", JPEG)).toEqual({ ok: true, mime: "image/jpeg" });
    expect(checkUpload("ORDER", PDF)).toEqual({ ok: false, code: "VALIDATION:mime" });
    expect(checkUpload("FABRIC", EXE)).toEqual({ ok: false, code: "VALIDATION:mime" });
    expect(checkUpload("RECEIPT", PDF)).toEqual({ ok: true, mime: "application/pdf" });
    expect(checkUpload("RECEIPT", JPEG)).toEqual({ ok: false, code: "VALIDATION:mime" });
    expect(checkUpload("CUSTOMER", new Uint8Array())).toEqual({ ok: false, code: "VALIDATION:empty" });
    const big = new Uint8Array(8 * 1024 * 1024 + 1);
    big.set(JPEG);
    expect(checkUpload("CUSTOMER", big)).toEqual({ ok: false, code: "VALIDATION:size" });
  });

  it("clé tenants/{atelier}/{catégorie}/{entité}/{fichier}", () => {
    expect(objectKey(T, "CUSTOMER", E, F, "image/jpeg")).toBe(`tenants/${T}/customers/${E}/${F}.jpg`);
    expect(objectKey(T, "RECEIPT", E, F, "application/pdf")).toBe(`tenants/${T}/receipts/${E}/${F}.pdf`);
    expect(() => objectKey("../x", "CUSTOMER", E, F, "image/jpeg")).toThrow("VALIDATION:key");
    expect(keyBelongsToTenant(`tenants/${T}/orders/x.jpg`, T)).toBe(true);
    expect(keyBelongsToTenant(`tenants/${OTHER}/orders/x.jpg`, T)).toBe(false);
    expect(keyBelongsToTenant(`tenants/${T}/../${OTHER}/x.jpg`, T)).toBe(false);
  });

  it("messages en français", () => {
    expect(fileErrorMessage("VALIDATION:mime")).toContain("JPEG");
    expect(fileErrorMessage("NOT_FOUND:orders")).toContain("synchronisation");
    expect(fileErrorMessage("FORBIDDEN:files.write")).toContain("rôle");
    expect(dbErrorCode('new row… "NOT_FOUND:customers"')).toBe("NOT_FOUND:customers");
    expect(dbErrorCode("boom")).toBe("DB_ERROR");
    expect(dbErrorCode("RATE_LIMITED:files")).toBe("RATE_LIMITED:files");
    expect(statusForCode("RATE_LIMITED:files")).toBe(429);
  });
});

function record(over: Partial<FileRecord>): FileRecord {
  return {
    id: F,
    tenant_id: T,
    owner_id: null,
    category: "CUSTOMER",
    entity_type: "customers",
    entity_id: E,
    bucket: "b",
    key: `tenants/${T}/customers/${E}/${F}.jpg`,
    mime: "image/jpeg",
    size_bytes: 7,
    purpose: "PHOTO",
    created_at: "2026-10-02T10:00:00Z",
    deleted_at: null,
    ...over,
  };
}

function fakeStorage() {
  const objects = new Map<string, Uint8Array>();
  const storage: R2Storage = {
    bucket: "atelier-files",
    async put(key, body) {
      objects.set(key, body);
    },
    async remove(key) {
      objects.delete(key);
    },
    async signedGetUrl(key, ttl) {
      return `https://r2.test/${key}?ttl=${ttl}`;
    },
  };
  return { storage, objects };
}

describe("service /api/files", () => {
  it("envoi : objet dans le dossier de l'atelier, enregistré, lien signé", async () => {
    const { storage, objects } = fakeStorage();
    const db: FilesDb = {
      register: vi.fn(async (input) => record({ id: input.id, key: input.key, mime: input.mime, size_bytes: input.size })),
      list: vi.fn(),
      remove: vi.fn(),
    };
    const view = await createFileService({ tenantId: T, storage, db, uuid: () => F }).upload("CUSTOMER", E, JPEG);
    expect([...objects.keys()]).toEqual([`tenants/${T}/customers/${E}/${F}.jpg`]);
    expect(db.register).toHaveBeenCalledWith(expect.objectContaining({ bucket: "atelier-files", mime: "image/jpeg", size: JPEG.length }));
    expect(view).toMatchObject({ id: F, mime: "image/jpeg", url: `https://r2.test/tenants/${T}/customers/${E}/${F}.jpg?ttl=600` });
  });

  it("type refusé avant tout envoi", async () => {
    const { storage, objects } = fakeStorage();
    const db: FilesDb = { register: vi.fn(), list: vi.fn(), remove: vi.fn() };
    await expect(createFileService({ tenantId: T, storage, db }).upload("ORDER", E, EXE)).rejects.toMatchObject({ code: "VALIDATION:mime", status: 422 });
    expect(objects.size).toBe(0);
    expect(db.register).not.toHaveBeenCalled();
  });

  it("enregistrement refusé (entité d'un autre atelier) : l'objet est retiré de R2", async () => {
    const { storage, objects } = fakeStorage();
    const db: FilesDb = {
      register: vi.fn(async () => {
        throw new Error('NOT_FOUND:customers');
      }),
      list: vi.fn(),
      remove: vi.fn(),
    };
    await expect(createFileService({ tenantId: T, storage, db, uuid: () => F }).upload("CUSTOMER", E, PNG)).rejects.toMatchObject({
      code: "NOT_FOUND:customers",
      status: 404,
    });
    expect(objects.size).toBe(0);
  });

  it("lecture : jamais de lien pour une ligne hors de l'atelier", async () => {
    const { storage } = fakeStorage();
    const db: FilesDb = {
      register: vi.fn(),
      list: vi.fn(async () => [
        record({}),
        record({ id: "x1", tenant_id: OTHER, key: `tenants/${OTHER}/customers/${E}/a.jpg` }),
        record({ id: "x2", key: `tenants/${OTHER}/customers/${E}/b.jpg` }),
      ]),
      remove: vi.fn(),
    };
    const views = await createFileService({ tenantId: T, storage, db }).list("CUSTOMER", E);
    expect(views.map((v) => v.id)).toEqual([F]);
  });

  it("suppression d'un reçu refusée par la base", async () => {
    const { storage } = fakeStorage();
    const db: FilesDb = {
      register: vi.fn(),
      list: vi.fn(),
      remove: vi.fn(async () => {
        throw new Error("RECEIPT_IMMUTABLE");
      }),
    };
    const error = await createFileService({ tenantId: T, storage, db }).remove(F).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FileServiceError);
    expect(error).toMatchObject({ code: "RECEIPT_IMMUTABLE", status: 409 });
  });
});

describe("R2 (signature S3)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("non configuré sans les variables serveur", () => {
    vi.stubEnv("R2_ACCOUNT_ID", "");
    vi.stubEnv("R2_ACCESS_KEY_ID", "");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "");
    vi.stubEnv("R2_BUCKET", "");
    vi.stubEnv("R2_ENDPOINT", "");
    expect(getR2Env()).toBeNull();
  });

  it("point d'accès du compte, lien de lecture signé et limité dans le temps", async () => {
    vi.stubEnv("R2_ACCOUNT_ID", "acc123");
    vi.stubEnv("R2_ACCESS_KEY_ID", "AKIDTEST");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "secret");
    vi.stubEnv("R2_BUCKET", "atelier-files");
    vi.stubEnv("R2_ENDPOINT", "");
    const env = getR2Env();
    expect(env).toEqual({ endpoint: "https://acc123.r2.cloudflarestorage.com", bucket: "atelier-files", accessKeyId: "AKIDTEST", secretAccessKey: "secret" });
    const url = new URL(await createR2Storage(env!).signedGetUrl(`tenants/${T}/customers/${E}/${F}.jpg`, 600));
    expect(url.origin + url.pathname).toBe(`https://acc123.r2.cloudflarestorage.com/atelier-files/tenants/${T}/customers/${E}/${F}.jpg`);
    expect(url.searchParams.get("X-Amz-Expires")).toBe("600");
    expect(url.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    expect(url.searchParams.get("X-Amz-Credential")).toMatch(/^AKIDTEST\/\d{8}\/auto\/s3\/aws4_request$/);
    expect(url.toString()).not.toContain("secret");
  });

  it("envoi : PUT signé avec le type de contenu, échec remonté", async () => {
    const calls: Request[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo) => {
      calls.push(input as Request);
      return new Response(null, { status: calls.length === 1 ? 200 : 403 });
    }));
    const storage = createR2Storage({ endpoint: "https://r2.test", bucket: "b", accessKeyId: "AK", secretAccessKey: "S" });
    await storage.put("tenants/t/x.jpg", JPEG, "image/jpeg");
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].url).toBe("https://r2.test/b/tenants/t/x.jpg");
    expect(calls[0].headers.get("content-type")).toBe("image/jpeg");
    expect(calls[0].headers.get("authorization")).toMatch(/^AWS4-HMAC-SHA256 Credential=AK\//);
    await expect(storage.put("tenants/t/y.jpg", JPEG, "image/jpeg")).rejects.toThrow("R2_PUT_FAILED:403");
  });
});
