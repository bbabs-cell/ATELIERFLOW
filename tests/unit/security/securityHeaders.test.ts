import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, securityHeaders } from "@/infrastructure/http/securityHeaders";

function directive(policy: string, name: string): string[] {
  const entry = policy.split("; ").find((d) => d.startsWith(`${name} `) || d === name);
  return entry ? entry.split(" ").slice(1) : [];
}

describe("contentSecurityPolicy", () => {
  const policy = contentSecurityPolicy({ supabaseUrl: "https://abc.supabase.co/" });

  it("limite scripts et connexions au site, à Supabase et à R2", () => {
    expect(directive(policy, "script-src")).toEqual(["'self'", "'unsafe-inline'"]);
    expect(directive(policy, "connect-src")).toEqual([
      "'self'",
      "https://abc.supabase.co",
      "wss://abc.supabase.co",
      "https://*.r2.cloudflarestorage.com",
    ]);
    expect(directive(policy, "img-src")).toContain("https://*.r2.cloudflarestorage.com");
  });

  it("interdit l'intégration dans un cadre, les plugins et les formulaires externes", () => {
    expect(directive(policy, "frame-ancestors")).toEqual(["'none'"]);
    expect(directive(policy, "object-src")).toEqual(["'none'"]);
    expect(directive(policy, "form-action")).toEqual(["'self'"]);
    expect(directive(policy, "base-uri")).toEqual(["'self'"]);
    expect(policy).toContain("upgrade-insecure-requests");
  });

  it("n'autorise eval qu'en développement et vercel.live qu'en prévisualisation", () => {
    expect(policy).not.toContain("unsafe-eval");
    expect(policy).not.toContain("vercel.live");
    expect(directive(contentSecurityPolicy({ dev: true }), "script-src")).toContain("'unsafe-eval'");
    expect(contentSecurityPolicy({ dev: true })).not.toContain("upgrade-insecure-requests");
    const preview = contentSecurityPolicy({ preview: true });
    expect(directive(preview, "script-src")).toContain("https://vercel.live");
    expect(directive(preview, "frame-src")).toEqual(["https://vercel.live"]);
  });

  it("ignore une URL Supabase invalide (mode démo)", () => {
    for (const supabaseUrl of [undefined, "", "pas une url", "javascript:alert(1)"]) {
      expect(directive(contentSecurityPolicy({ supabaseUrl }), "connect-src")).toEqual([
        "'self'",
        "https://*.r2.cloudflarestorage.com",
      ]);
    }
  });
});

describe("securityHeaders", () => {
  it("pose les en-têtes de base", () => {
    const keys = securityHeaders().map((h) => h.key);
    expect(keys).toEqual([
      "Content-Security-Policy",
      "X-Content-Type-Options",
      "X-Frame-Options",
      "Referrer-Policy",
      "Permissions-Policy",
      "Cross-Origin-Opener-Policy",
    ]);
  });
});
