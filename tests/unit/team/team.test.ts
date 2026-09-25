import { describe, expect, it } from "vitest";
import {
  can,
  permissionsFor,
  PERMISSIONS_BY_ROLE,
  TENANT_ROLE_CODES,
} from "@/domain/team/roles";
import {
  validateDeactivation,
  validateInviteMemberDraft,
  validateOwnStatusTransition,
  validateRoleChange,
} from "@/domain/team/teamMember";
import type { TeamMemberRecord } from "@/domain/team/teamMember";

function member(over: Partial<TeamMemberRecord> = {}): TeamMemberRecord {
  return {
    id: "m1",
    tenant_id: "t1",
    full_name: "Awa Diop",
    phone: null,
    role: "OWNER",
    status: "ACTIVE",
    invited_by: null,
    joined_at: "2026-01-01T08:00:00.000Z",
    created_at: "2026-01-01T08:00:00.000Z",
    updated_at: "2026-01-01T08:00:00.000Z",
    ...over,
  };
}

describe("matrice de permissions", () => {
  it("reflète le seed 0007 : OWNER complet et APPRENTICE en lecture seule", () => {
    expect(can("OWNER", "team.manage")).toBe(true);
    expect(can("OWNER", "audit.read")).toBe(true);
    expect(can("MANAGER", "team.read")).toBe(true);
    expect(can("MANAGER", "team.manage")).toBe(false);
    expect(can("EMPLOYEE", "payments.write")).toBe(false);
    expect(can("EMPLOYEE", "orders.write")).toBe(true);
    expect(can("APPRENTICE", "customers.write")).toBe(false);
    expect(can("APPRENTICE", "orders.read")).toBe(true);
  });

  it("couvre les quatre rôles du tenant", () => {
    for (const role of TENANT_ROLE_CODES) {
      expect(permissionsFor(role).length).toBeGreaterThan(0);
      for (const permission of permissionsFor(role)) {
        expect(PERMISSIONS_BY_ROLE[role]).toContain(permission);
      }
    }
  });
});

describe("validateInviteMemberDraft", () => {
  it("accepte et normalise", () => {
    const draft = validateInviteMemberDraft({
      fullName: "  Sita Ndiaye  ",
      phone: "+221 77 123 45 67",
      role: "EMPLOYEE",
    });
    expect(draft.errors).toEqual({});
    expect(draft.value.fullName).toBe("Sita Ndiaye");
    expect(draft.value.phone).toBe("+221771234567");
  });

  it("rejette nom court, rôle inconnu et téléphone invalide", () => {
    const draft = validateInviteMemberDraft({
      fullName: "A",
      phone: "abc",
      role: "BOSS",
    });
    expect(draft.errors.fullName).toBeTruthy();
    expect(draft.errors.phone).toBeTruthy();
    expect(draft.errors.role).toBeTruthy();
  });
});

describe("gardes anti-verrouillage (miroir tenant_memberships_rules)", () => {
  it("interdit de changer son propre rôle", () => {
    const result = validateRoleChange({
      member: member(),
      operatorId: "m1",
      targetRole: "MANAGER",
      activeOwnersBesidesThis: 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("propre rôle");
  });

  it("interdit de démouer le dernier OWNER actif", () => {
    const result = validateRoleChange({
      member: member(),
      operatorId: "m2",
      targetRole: "EMPLOYEE",
      activeOwnersBesidesThis: 0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("OWNER actif");

    const other = member({ id: "m1", role: "MANAGER" });
    const allowed = validateRoleChange({
      member: other,
      operatorId: "m2",
      targetRole: "EMPLOYEE",
      activeOwnersBesidesThis: 0,
    });
    expect(allowed.ok).toBe(true);
  });

  it("interdit l'auto-désactivation et la désactivation du dernier OWNER", () => {
    expect(
      validateDeactivation({ member: member(), operatorId: "m1", activeOwnersBesidesThis: 0 }).ok,
    ).toBe(false);
    expect(
      validateDeactivation({ member: member(), operatorId: "m1", activeOwnersBesidesThis: 1 }).ok,
    ).toBe(false);
    expect(
      validateDeactivation({ member: member(), operatorId: "m2", activeOwnersBesidesThis: 0 }).ok,
    ).toBe(false);
    expect(
      validateDeactivation({ member: member(), operatorId: "m2", activeOwnersBesidesThis: 1 }).ok,
    ).toBe(true);
  });

  it("sur soi : seule INVITED → ACTIVE est possible", () => {
    expect(validateOwnStatusTransition("INVITED", "ACTIVE").ok).toBe(true);
    expect(validateOwnStatusTransition("ACTIVE", "DEACTIVATED").ok).toBe(false);
    expect(validateOwnStatusTransition("ACTIVE", "ACTIVE").ok).toBe(true);
  });
});