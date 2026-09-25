export type FetchStrategy = "precache" | "stale-while-revalidate" | "network-only";

export const SW_VERSION = "v1";

export function shellCacheName(version: string = SW_VERSION): string {
  return `atelierflow-shell-${version}`;
}

export function runtimeCacheName(version: string = SW_VERSION): string {
  return `atelierflow-runtime-${version}`;
}

export function isCurrentCacheName(name: string, version: string = SW_VERSION): boolean {
  return (
    name === shellCacheName(version) || name === runtimeCacheName(version)
  );
}

export const SHELL_URLS: readonly string[] = [
  "/",
  "/offline",
  "/pwa/manifest.webmanifest",
  "/pwa/icon.svg",
  "/pwa/maskable.svg",
];

const PRIVATE_PREFIXES: readonly string[] = [
  "/api/",
  "/auth/",
  "/sync",
  "/invitation",
  "/reset-password",
];

const NEXT_STATIC_PREFIX = "/_next/static/";

const ASSET_PATTERN =
  /\.(?:js|mjs|css|woff2?|ttf|eot|svg|png|jpe?g|webp|avif|gif|ico|json|webmanifest)$/i;

export interface RequestClassifyInput {
  url: string;
  method: string;
  mode: RequestMode;
  pageOrigin: string;
}

export function requestIsSameOrigin(url: string, pageOrigin: string): boolean {
  try {
    return new URL(url, pageOrigin).origin === pageOrigin;
  } catch {
    return false;
  }
}

export function isNavigation(
  mode: RequestMode,
  method: string,
  sameOrigin: boolean,
): boolean {
  return sameOrigin && mode === "navigate" && method === "GET";
}

export function classifyRequest(input: RequestClassifyInput): FetchStrategy {
  if (input.method !== "GET") return "network-only";
  const sameOrigin = requestIsSameOrigin(input.url, input.pageOrigin);
  if (!sameOrigin) return "network-only";
  if (input.mode === "navigate") return "precache";

  const path = new URL(input.url, input.pageOrigin).pathname;
  if (PRIVATE_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return "network-only";
  }
  if (path.startsWith(NEXT_STATIC_PREFIX) || ASSET_PATTERN.test(path)) {
    return "stale-while-revalidate";
  }
  return "network-only";
}