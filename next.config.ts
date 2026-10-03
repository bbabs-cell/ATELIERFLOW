import type { NextConfig } from "next";
import { securityHeaders } from "./src/infrastructure/http/securityHeaders";

/** Identifiant de cette version : l'application ouverte le compare à /api/version. */
const BUILD_ID = (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 12) || `local-${Date.now()}`;

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_ID: BUILD_ID,
  },
  turbopack: {
    root: process.cwd(),
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders({
          supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
          dev: process.env.NODE_ENV === "development",
          preview: process.env.VERCEL_ENV === "preview",
        }),
      },
    ];
  },
};

export default nextConfig;
