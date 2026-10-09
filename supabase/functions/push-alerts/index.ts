/**
 * push-alerts — envoie les alertes « push » de l'atelier (téléphone qui
 * sonne même application fermée).
 *
 * Deux usages :
 *  - planifié (pg_cron, chaque minute) : en-tête x-cron-secret = secret du
 *    Vault ; envoie les alertes dues (claim_due_push_alerts, une seule fois
 *    par appareil) ;
 *  - test depuis l'application : session de l'utilisateur (Authorization:
 *    Bearer) ; envoie une notification de test à SES appareils.
 * Les clés VAPID sont créées au premier passage et gardées dans le Vault :
 * elles ne quittent jamais Supabase.
 */
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const ALLOWED_ORIGINS = new Set(["https://atelier.magyapro.com", "https://atelierflow-alpha.vercel.app"]);

interface PushConfig {
  public: string | null;
  private: string | null;
  subject: string | null;
  cron_secret: string | null;
}

interface Target {
  subscription_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  alert_key?: string;
  title?: string;
  body?: string;
  url?: string;
  urgent?: boolean;
}

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  return ALLOWED_ORIGINS.has(origin)
    ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        Vary: "Origin",
      }
    : {};
}

function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors(req) } });
}

/** Comparaison à temps constant (secret du planificateur). */
function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== "POST") return json(req, 405, { error: "METHOD" });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let { data: cfg } = await db.rpc("push_config");
  let config = cfg as PushConfig | null;
  if (!config?.public || !config?.private) {
    const keys = webpush.generateVAPIDKeys();
    ({ data: cfg } = await db.rpc("push_store_vapid", {
      p_public: keys.publicKey,
      p_private: keys.privateKey,
      p_subject: "https://atelier.magyapro.com",
    }));
    config = cfg as PushConfig | null;
  }
  if (!config?.public || !config?.private || !config.subject) return json(req, 500, { error: "VAPID_UNAVAILABLE" });
  webpush.setVapidDetails(config.subject, config.public, config.private);

  let targets: Target[] = [];
  let mode: "cron" | "test";
  const cronSecret = req.headers.get("x-cron-secret");
  if (cronSecret !== null) {
    if (!config.cron_secret || !sameSecret(cronSecret, config.cron_secret)) return json(req, 401, { error: "UNAUTHORIZED" });
    mode = "cron";
    const { data, error } = await db.rpc("claim_due_push_alerts");
    if (error) return json(req, 500, { error: "CLAIM_FAILED" });
    targets = (data ?? []) as Target[];
  } else {
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: user } = token ? await db.auth.getUser(token) : { data: { user: null } };
    if (!user?.user) return json(req, 401, { error: "UNAUTHENTICATED" });
    mode = "test";
    const { data } = await db.rpc("push_test_targets", { p_profile: user.user.id });
    targets = ((data ?? []) as Target[]).map((t) => ({
      ...t,
      alert_key: `test:${Date.now()}`,
      title: "Test de notification",
      body: "Les alertes de l'atelier arrivent sur ce téléphone, même application fermée.",
      url: "/parametres",
      urgent: false,
    }));
  }

  let sent = 0;
  let gone = 0;
  let failed = 0;
  await Promise.all(
    targets.map(async (t) => {
      const payload = JSON.stringify({ title: t.title, body: t.body, url: t.url, tag: t.alert_key, urgent: t.urgent === true });
      try {
        await webpush.sendNotification({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, payload, {
          TTL: t.urgent ? 15 * 60 : 6 * 60 * 60,
          urgency: t.urgent ? "high" : "normal",
        });
        sent += 1;
        await db.rpc("push_mark_result", { p_subscription: t.subscription_id, p_ok: true, p_gone: false });
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode ?? 0;
        const isGone = status === 404 || status === 410;
        if (isGone) gone += 1;
        else failed += 1;
        await db.rpc("push_mark_result", { p_subscription: t.subscription_id, p_ok: false, p_gone: isGone });
      }
    }),
  );
  return json(req, 200, { mode, targets: targets.length, sent, gone, failed });
});
