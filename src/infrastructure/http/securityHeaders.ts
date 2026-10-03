/**
 * En-têtes de sécurité HTTP posés sur toutes les réponses (étape 23).
 *
 * Le jeton de session Supabase vit dans le stockage du navigateur : une
 * injection de script le volerait. La CSP limite donc les scripts au site
 * lui-même et les connexions à Supabase et R2. Next.js insère des scripts
 * en ligne pour l'hydratation : 'unsafe-inline' reste nécessaire tant que
 * les pages sont statiques (un nonce imposerait un rendu dynamique).
 */

export interface SecurityHeadersOptions {
  /** NEXT_PUBLIC_SUPABASE_URL (absent en mode démo). */
  supabaseUrl?: string;
  /** Développement local : React a besoin d'eval pour ses outils. */
  dev?: boolean;
  /** Déploiement de prévisualisation Vercel : barre d'outils vercel.live. */
  preview?: boolean;
}

/** Les liens signés R2 pointent vers <compte>.r2.cloudflarestorage.com. */
const R2_ORIGIN = "https://*.r2.cloudflarestorage.com";
const VERCEL_LIVE = "https://vercel.live";

function origin(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.origin : null;
  } catch {
    return null;
  }
}

export function contentSecurityPolicy(options: SecurityHeadersOptions = {}): string {
  const supabase = origin(options.supabaseUrl);
  const extra = (values: (string | null | false | undefined)[]) =>
    values.filter((v): v is string => typeof v === "string" && v.length > 0);

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", ...extra([options.dev && "'unsafe-eval'", options.preview && VERCEL_LIVE])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", R2_ORIGIN, ...extra([options.preview && VERCEL_LIVE])],
    "font-src": ["'self'", "data:"],
    "connect-src": [
      "'self'",
      ...extra([supabase, supabase && supabase.replace(/^http/, "ws"), options.preview && VERCEL_LIVE]),
      R2_ORIGIN,
    ],
    "frame-src": options.preview ? [VERCEL_LIVE] : ["'none'"],
    "worker-src": ["'self'"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  const policy = Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`);
  if (!options.dev) policy.push("upgrade-insecure-requests");
  return policy.join("; ");
}

export function securityHeaders(options: SecurityHeadersOptions = {}): { key: string; value: string }[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(options) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];
}
