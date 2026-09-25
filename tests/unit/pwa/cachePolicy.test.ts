import { describe, expect, it } from "vitest";
import {
  classifyRequest,
  isCurrentCacheName,
  isNavigation,
  requestIsSameOrigin,
  SHELL_URLS,
  shellCacheName,
  SW_VERSION,
} from "@/domain/pwa/cachePolicy";

const ORIGIN = "https://atelier.example";

function classify(opts: {
  url: string;
  method?: string;
  mode?: RequestMode;
}): ReturnType<typeof classifyRequest> {
  return classifyRequest({
    url: opts.url,
    method: opts.method ?? "GET",
    mode: opts.mode ?? "same-origin",
    pageOrigin: ORIGIN,
  });
}

describe("cachePolicy", () => {
  it("caches navigations (app shell) with the precache strategy", () => {
    expect(classify({ url: "/", mode: "navigate" })).toBe("precache");
    expect(classify({ url: "/offline", mode: "navigate" })).toBe("precache");
    expect(classify({ url: "/dashboard", mode: "navigate" })).toBe("precache");
  });

  it("serves static assets stale-while-revalidate", () => {
    expect(classify({ url: "/_next/static/chunks/app.js" })).toBe(
      "stale-while-revalidate",
    );
    expect(classify({ url: "/_next/static/css/abc.css" })).toBe(
      "stale-while-revalidate",
    );
    expect(classify({ url: "/images/robe.webp" })).toBe("stale-while-revalidate");
    expect(classify({ url: "/pwa/icon.svg" })).toBe("stale-while-revalidate");
    expect(classify({ url: "/pwa/manifest.webmanifest" })).toBe(
      "stale-while-revalidate",
    );
  });

  it("never caches private routes or non-GET requests", () => {
    expect(classify({ url: "/api/payments" })).toBe("network-only");
    expect(classify({ url: "/api/sync" })).toBe("network-only");
    expect(classify({ url: "/auth/callback" })).toBe("network-only");
    expect(classify({ url: "/logout" })).toBe("network-only");
    expect(classify({ url: "/api/payments", method: "POST" })).toBe("network-only");
    expect(classify({ url: "/customers", method: "POST" })).toBe("network-only");
  });

  it("never caches cross-origin or raw navigation-like unknown gets", () => {
    expect(classify({ url: "https://cdn.example/lib.js" })).toBe("network-only");
    expect(classify({ url: "/page-without-asset-extension" })).toBe("network-only");
  });

  it("recognises navigations only for same-origin GET", () => {
    expect(isNavigation("navigate", "GET", true)).toBe(true);
    expect(isNavigation("navigate", "POST", true)).toBe(false);
    expect(isNavigation("same-origin", "GET", true)).toBe(false);
    expect(isNavigation("navigate", "GET", false)).toBe(false);
  });

  it("versions cache names and invalidates obsolete ones", () => {
    expect(shellCacheName()).toBe(`atelierflow-shell-${SW_VERSION}`);
    expect(isCurrentCacheName(shellCacheName())).toBe(true);
    expect(isCurrentCacheName("atelierflow-shell-old", SW_VERSION)).toBe(false);
    expect(requestIsSameOrigin("/x", ORIGIN)).toBe(true);
    expect(requestIsSameOrigin("https://evil.example/x", ORIGIN)).toBe(false);
    expect(SHELL_URLS).toContain("/");
    expect(SHELL_URLS).toContain("/offline");
  });
});