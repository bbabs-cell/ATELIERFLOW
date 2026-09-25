import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearActiveSession,
  demoSession,
  getActiveSession,
  peekActiveSession,
  sessionKey,
  setActiveSession,
  subscribeActiveSession,
} from "@/application/auth/session";

const SESSION = {
  tenantId: "bbbbbbbb-0000-4000-8000-000000000002",
  profileId: "aaaaaaaa-0000-4000-8000-000000000001",
  email: "a@b.sn",
  role: "OWNER",
  mode: "SUPABASE" as const,
};

afterEach(() => clearActiveSession());

describe("session active", () => {
  it("refuse tout accès métier sans session", () => {
    expect(peekActiveSession()).toBeNull();
    expect(() => getActiveSession()).toThrow("NO_ACTIVE_SESSION");
  });

  it("expose la session posée et notifie les abonnés", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeActiveSession(listener);
    setActiveSession(SESSION);
    expect(getActiveSession()).toEqual(SESSION);
    clearActiveSession();
    expect(listener).toHaveBeenNthCalledWith(1, SESSION);
    expect(listener).toHaveBeenNthCalledWith(2, null);
    unsubscribe();
  });

  it("clé distincte par tenant et par profil", () => {
    expect(sessionKey(SESSION)).not.toBe(sessionKey({ ...SESSION, tenantId: "cccccccc-0000-4000-8000-000000000003" }));
    expect(sessionKey(SESSION)).not.toBe(sessionKey({ ...SESSION, profileId: "dddddddd-0000-4000-8000-000000000004" }));
  });

  it("mode DEMO explicite", () => {
    expect(demoSession().mode).toBe("DEMO");
  });
});
