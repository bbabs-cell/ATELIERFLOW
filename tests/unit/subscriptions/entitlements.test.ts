import { describe, expect, it } from "vitest";
import {
  canAdd,
  daysLeft,
  featureEnabled,
  formatLimit,
  formatPrice,
  isPlanError,
  meters,
  noticeFor,
  parseEntitlements,
  planAction,
  planErrorMessage,
  serializeEntitlements,
  type Entitlements,
} from "@/domain/subscriptions/entitlements";
import { teamErrorMessage } from "@/domain/team/invitations";
import { fileErrorMessage } from "@/domain/files/files";

const FREE = {
  code: "FREE",
  name: "Découverte",
  description: "Pour démarrer",
  price_monthly: 0,
  currency: "XOF",
  limits: { users_max: 1, customers_max: 30, orders_max: 60, storage_mb: 200, whatsapp: false, stock: false, audit: false },
  features: ["clients"],
  trial_days: 0,
  is_default: true,
};
const BASIC = { ...FREE, code: "BASIC", name: "Essentiel", price_monthly: 5000, is_default: false, limits: { ...FREE.limits, users_max: 3, customers_max: 300, whatsapp: true, stock: true } };
const PRO = { ...FREE, code: "PRO", name: "Atelier pro", price_monthly: 10000, trial_days: 14, is_default: false, limits: { users_max: 15, customers_max: 5000, orders_max: 20000, storage_mb: 10000, whatsapp: true, stock: true, audit: true } };

function server(overrides: Record<string, unknown> = {}) {
  return {
    plan_code: "FREE",
    plan_name: "Découverte",
    limits: FREE.limits,
    status: "ACTIVE",
    subscribed_plan_code: "FREE",
    trial_ends_at: null,
    current_period_end: null,
    grace_ends_at: null,
    price_monthly: 0,
    currency: "XOF",
    requested_plan_code: null,
    requested_at: null,
    usage: { users: 1, pending_invitations: 0, customers: 12, orders: 4, storage_bytes: 3 * 1024 * 1024 },
    plans: [FREE, BASIC, PRO],
    ...overrides,
  };
}

function ent(overrides: Record<string, unknown> = {}): Entitlements {
  const parsed = parseEntitlements(server(overrides));
  if (!parsed) throw new Error("parse");
  return parsed;
}

describe("parseEntitlements", () => {
  it("lit la réponse du serveur", () => {
    const e = ent();
    expect(e.planCode).toBe("FREE");
    expect(e.limits.customers_max).toBe(30);
    expect(e.limits.stock).toBe(false);
    expect(e.usage).toEqual({ users: 1, pendingInvitations: 0, customers: 12, orders: 4, storageBytes: 3 * 1024 * 1024 });
    expect(e.plans.map((p) => p.code)).toEqual(["FREE", "BASIC", "PRO"]);
    expect(e.plans[2].trialDays).toBe(14);
  });

  it("refuse une réponse sans plan et tolère les champs manquants", () => {
    expect(parseEntitlements(null)).toBeNull();
    expect(parseEntitlements({ status: "ACTIVE" })).toBeNull();
    const e = parseEntitlements({ plan_code: "X", status: "BIZARRE" });
    expect(e?.status).toBe("NONE");
    // limite absente ou négative = illimitée ; drapeau absent = disponible
    expect(e?.limits.customers_max).toBeNull();
    expect(parseEntitlements({ plan_code: "X", limits: { orders_max: -1 } })?.limits.orders_max).toBeNull();
    expect(e?.limits.stock).toBe(true);
  });

  it("survit à un aller-retour par le cache local", () => {
    const e = ent({ requested_plan_code: "BASIC", requested_at: "2026-10-03T10:00:00Z" });
    expect(parseEntitlements(JSON.parse(JSON.stringify(serializeEntitlements(e))))).toEqual(e);
  });
});

describe("canAdd", () => {
  it("autorise sous la limite et bloque à la limite", () => {
    expect(canAdd(ent(), "customers")).toEqual({ ok: true });
    expect(canAdd(ent({ usage: { ...server().usage, customers: 30 } }), "customers")).toEqual({ ok: false, code: "PLAN_LIMIT:customers", limit: 30 });
  });

  it("retient le plus grand décompte entre serveur et appareil (créations hors ligne)", () => {
    expect(canAdd(ent(), "customers", 30).ok).toBe(false);
    expect(canAdd(ent(), "orders", 59).ok).toBe(true);
  });

  it("compte les invitations en attente comme des utilisateurs", () => {
    const e = ent({ limits: { ...FREE.limits, users_max: 3 }, usage: { ...server().usage, users: 2, pending_invitations: 1 } });
    expect(canAdd(e, "users")).toEqual({ ok: false, code: "PLAN_LIMIT:users", limit: 3 });
  });

  it("ne bloque rien sans droits connus ni limite", () => {
    expect(canAdd(null, "customers", 1_000_000).ok).toBe(true);
    expect(canAdd(ent({ limits: { ...FREE.limits, customers_max: null } }), "customers", 99_999).ok).toBe(true);
  });
});

describe("fonctions et jauges", () => {
  it("featureEnabled suit les drapeaux du plan", () => {
    expect(featureEnabled(ent(), "stock")).toBe(false);
    expect(featureEnabled(ent({ limits: PRO.limits }), "stock")).toBe(true);
    expect(featureEnabled(null, "whatsapp")).toBe(true);
  });

  it("meters calcule pourcentage et niveau", () => {
    const m = meters(ent({ usage: { ...server().usage, customers: 30, orders: 50 } }));
    expect(m.find((x) => x.kind === "customers")).toMatchObject({ used: 30, limit: 30, percent: 100, level: "full" });
    expect(m.find((x) => x.kind === "orders")).toMatchObject({ percent: 83, level: "near" });
    expect(m.find((x) => x.kind === "storage")).toMatchObject({ used: 3, limit: 200, level: "ok" });
  });
});

describe("échéances", () => {
  const now = new Date("2026-10-03T12:00:00Z");

  it("daysLeft arrondit au jour supérieur et ne descend pas sous 0", () => {
    expect(daysLeft("2026-10-05T11:00:00Z", now)).toBe(2);
    expect(daysLeft("2026-10-01T00:00:00Z", now)).toBe(0);
    expect(daysLeft(null, now)).toBeNull();
  });

  it("noticeFor : fin d'essai proche, grâce, expiration", () => {
    expect(noticeFor(ent({ status: "TRIAL", trial_ends_at: "2026-10-15T12:00:00Z" }), now)).toBeNull();
    expect(noticeFor(ent({ status: "TRIAL", trial_ends_at: "2026-10-06T12:00:00Z" }), now)).toEqual({ kind: "trial-ending", days: 3 });
    expect(noticeFor(ent({ status: "GRACE", grace_ends_at: "2026-10-05T00:00:00Z" }), now)).toEqual({ kind: "grace", until: "2026-10-05T00:00:00Z" });
    expect(noticeFor(ent({ status: "EXPIRED", subscribed_plan_code: "PRO" }), now)).toEqual({ kind: "expired", plan: "PRO" });
    expect(noticeFor(ent(), now)).toBeNull();
    expect(noticeFor(null, now)).toBeNull();
  });
});

describe("planAction", () => {
  it("plan gratuit immédiat, plan payant sur demande", () => {
    const e = ent({ plan_code: "PRO", status: "TRIAL" });
    expect(planAction(e, e.plans[2])).toBe("current");
    expect(planAction(e, e.plans[0])).toBe("switch");
    expect(planAction(e, e.plans[1])).toBe("request");
    expect(planAction(ent({ plan_code: "PRO", requested_plan_code: "BASIC" }), e.plans[1])).toBe("requested");
  });

  it("après expiration, le plan gratuit appliqué est le plan actuel", () => {
    const e = ent({ status: "EXPIRED", subscribed_plan_code: "PRO" });
    expect(planAction(e, e.plans[0])).toBe("current");
    expect(planAction(e, e.plans[2])).toBe("request");
  });
});

describe("messages", () => {
  it("traduit les refus du serveur", () => {
    expect(planErrorMessage("PLAN_LIMIT:customers", 30)).toContain("(30 clients)");
    expect(planErrorMessage("PLAN_LIMIT:orders")).toContain("commandes en cours");
    expect(planErrorMessage("PLAN_LIMIT:users")).toContain("utilisateurs");
    expect(planErrorMessage("PLAN_LIMIT:storage")).toContain("stockage");
    expect(planErrorMessage("PLAN_FEATURE:stock")).toContain("stock");
    expect(planErrorMessage("NOT_FOUND:orders")).toBeNull();
    expect(isPlanError("PLAN_FEATURE:stock")).toBe(true);
    expect(isPlanError("FORBIDDEN:x")).toBe(false);
  });

  it("les écrans équipe et fichiers affichent les refus de plan", () => {
    expect(teamErrorMessage(new Error("PLAN_LIMIT:users"))).toContain("utilisateurs");
    expect(fileErrorMessage("PLAN_LIMIT:storage")).toContain("stockage");
  });

  it("formats", () => {
    expect(formatPrice(0)).toBe("Gratuit");
    expect(formatPrice(5000)).toMatch(/^5\s000\sF\sCFA$/);
    expect(formatLimit(null)).toBe("Illimité");
    expect(formatLimit(2000, "Mo")).toBe("2 Go");
    expect(formatLimit(200, "Mo")).toBe("200 Mo");
    expect(formatLimit(20000)).toMatch(/^20\s000$/);
  });
});
