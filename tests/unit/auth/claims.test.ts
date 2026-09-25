import { describe, expect, it } from "vitest";
import { decodeSessionClaims, resolveIdentity } from "@/domain/auth/claims";

const SUB = "aaaaaaaa-0000-4000-8000-000000000001";
const TENANT = "bbbbbbbb-0000-4000-8000-000000000002";

function b64url(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function jwt(payload: Record<string, unknown>): string {
  return `${b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64url(JSON.stringify(payload))}.signature`;
}

describe("decodeSessionClaims", () => {
  it("lit sub, email, tenant_id, membership_role et exp", () => {
    const claims = decodeSessionClaims(
      jwt({ sub: SUB, email: "a@b.sn", tenant_id: TENANT, membership_role: "OWNER", exp: 123 }),
    );
    expect(claims).toEqual({
      sub: SUB,
      email: "a@b.sn",
      tenantId: TENANT,
      membershipRole: "OWNER",
      exp: 123,
    });
  });

  it("décode un email non ASCII (base64url + UTF-8)", () => {
    const claims = decodeSessionClaims(jwt({ sub: SUB, email: "awa.ndiayé@atelier.sn" }));
    expect(claims?.email).toBe("awa.ndiayé@atelier.sn");
  });

  it("refuse un jeton mal formé ou sans sub UUID", () => {
    expect(decodeSessionClaims("pas-un-jwt")).toBeNull();
    expect(decodeSessionClaims("a.%%%.c")).toBeNull();
    expect(decodeSessionClaims(jwt({ sub: "admin" }))).toBeNull();
  });

  it("ignore un tenant_id qui n'est pas un UUID", () => {
    const claims = decodeSessionClaims(jwt({ sub: SUB, tenant_id: "' or 1=1 --" }));
    expect(claims?.tenantId).toBeNull();
  });
});

describe("resolveIdentity", () => {
  it("READY quand le hook a posé tenant_id", () => {
    expect(resolveIdentity(jwt({ sub: SUB, tenant_id: TENANT, membership_role: "MANAGER" }))).toEqual({
      kind: "READY",
      profileId: SUB,
      tenantId: TENANT,
      role: "MANAGER",
      email: null,
    });
  });

  it("NEEDS_WORKSPACE sans membership active (pas de claim)", () => {
    expect(resolveIdentity(jwt({ sub: SUB, email: "a@b.sn" }))).toEqual({
      kind: "NEEDS_WORKSPACE",
      profileId: SUB,
      email: "a@b.sn",
    });
  });

  it("INVALID pour un jeton illisible", () => {
    expect(resolveIdentity("x.y")).toEqual({ kind: "INVALID" });
  });
});
