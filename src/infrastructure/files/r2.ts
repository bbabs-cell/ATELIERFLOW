import "server-only";
import { AwsClient } from "aws4fetch";

/**
 * Cloudflare R2 (API compatible S3) — CÔTÉ SERVEUR UNIQUEMENT.
 * Les identifiants viennent des variables d'environnement serveur (jamais
 * `NEXT_PUBLIC_*`) ; `server-only` fait échouer la compilation si ce module
 * est importé depuis du code navigateur. Le bucket reste privé : la
 * lecture passe par des liens signés de courte durée.
 */

export interface R2Env {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export const REQUIRED_R2_ENV = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"] as const;

export function getR2Env(): R2Env | null {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET?.trim();
  // R2_ENDPOINT : surcharge pour les tests (stockage S3 local).
  const endpoint = process.env.R2_ENDPOINT?.trim() || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) return null;
  return { endpoint: endpoint.replace(/\/+$/, ""), bucket, accessKeyId, secretAccessKey };
}

function encodeKey(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

export interface R2Storage {
  readonly bucket: string;
  put(key: string, body: Uint8Array, mime: string): Promise<void>;
  remove(key: string): Promise<void>;
  signedGetUrl(key: string, ttlSeconds: number, downloadName?: string): Promise<string>;
}

export function createR2Storage(env: R2Env): R2Storage {
  const client = new AwsClient({
    accessKeyId: env.accessKeyId,
    secretAccessKey: env.secretAccessKey,
    service: "s3",
    region: "auto",
  });
  const objectUrl = (key: string) => `${env.endpoint}/${env.bucket}/${encodeKey(key)}`;

  return {
    bucket: env.bucket,
    async put(key, body, mime) {
      const response = await client.fetch(objectUrl(key), {
        method: "PUT",
        body: body as BodyInit,
        headers: { "content-type": mime, "content-length": String(body.length) },
      });
      if (!response.ok) throw new Error(`R2_PUT_FAILED:${response.status}`);
    },
    async remove(key) {
      const response = await client.fetch(objectUrl(key), { method: "DELETE" });
      if (!response.ok && response.status !== 404) throw new Error(`R2_DELETE_FAILED:${response.status}`);
    },
    async signedGetUrl(key, ttlSeconds, downloadName) {
      const url = new URL(objectUrl(key));
      url.searchParams.set("X-Amz-Expires", String(ttlSeconds));
      if (downloadName) {
        url.searchParams.set("response-content-disposition", `inline; filename="${downloadName.replace(/[^\w.-]/g, "_")}"`);
      }
      const signed = await client.sign(url.toString(), { method: "GET", aws: { signQuery: true } });
      return signed.url;
    },
  };
}
