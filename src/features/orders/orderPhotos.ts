import { peekActiveSession } from "@/application/auth/session";
import { can, TENANT_ROLE_CODES, type TenantRoleCode } from "@/domain/team/roles";
import { compressPhoto, FilesClientError, uploadFile } from "@/infrastructure/files/filesClient";

/** Photos du tissu prises à la création d'une commande (4 au plus). */
export const MAX_ORDER_FORM_PHOTOS = 4;

/** Photos possibles : session en ligne et droit d'envoyer des fichiers. */
export function canAttachOrderPhotos(): boolean {
  const session = peekActiveSession();
  if (session?.mode !== "SUPABASE") return false;
  const role = session.role ?? null;
  return role !== null && (TENANT_ROLE_CODES as readonly string[]).includes(role) && can(role as TenantRoleCode, "files.write");
}

/**
 * Délais entre les tentatives : la commande vient d'être créée sur
 * l'appareil, le serveur ne la connaît qu'après la synchronisation
 * (quelques secondes). Tant qu'il répond « commande inconnue », on réessaie.
 */
const RETRY_DELAYS_MS = [1_500, 2_500, 4_000, 6_000, 10_000, 15_000];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface OrderPhotosResult {
  sent: number;
  failed: number;
}

/**
 * Envoie les photos du tissu dans les photos de la commande, en arrière-plan.
 * Ne bloque jamais la commande ; renvoie le nombre de photos envoyées.
 */
export async function uploadOrderPhotos(orderId: string, files: readonly File[]): Promise<OrderPhotosResult> {
  let sent = 0;
  let failed = 0;
  for (const file of files.slice(0, MAX_ORDER_FORM_PHOTOS)) {
    let body: Blob;
    try {
      body = await compressPhoto(file);
    } catch {
      body = file;
    }
    let done = false;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length && !done; attempt += 1) {
      if (attempt > 0) await wait(RETRY_DELAYS_MS[attempt - 1]);
      try {
        await uploadFile("ORDER", orderId, body, file.name || "tissu.jpg");
        done = true;
      } catch (error) {
        const code = error instanceof FilesClientError ? error.code : "";
        // Seule l'attente de la synchronisation justifie de réessayer.
        if (!code.startsWith("NOT_FOUND") && code !== "OFFLINE" && !code.startsWith("HTTP_5")) break;
      }
    }
    if (done) sent += 1;
    else failed += 1;
  }
  return { sent, failed };
}
