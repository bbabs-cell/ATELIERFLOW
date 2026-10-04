import type { FileCategory, FileView } from "@/domain/files/files";
import { getAccessToken } from "@/infrastructure/supabase/browserClient";

/**
 * Accès navigateur à /api/files. Aucune clé R2 ici : la session Supabase
 * de l'utilisateur est transmise, le serveur décide.
 */

export class FilesClientError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

async function authHeaders(): Promise<HeadersInit> {
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new FilesClientError("OFFLINE");
  const token = await getAccessToken();
  if (!token) throw new FilesClientError("UNAUTHENTICATED");
  return { Authorization: `Bearer ${token}` };
}

async function readError(response: Response): Promise<FilesClientError> {
  try {
    const body = (await response.json()) as { error?: { code?: string } };
    return new FilesClientError(body.error?.code ?? `HTTP_${response.status}`);
  } catch {
    return new FilesClientError(`HTTP_${response.status}`);
  }
}

export async function listFiles(category: FileCategory, entityId: string): Promise<FileView[]> {
  const params = new URLSearchParams({ category, entityId });
  const response = await fetch(`/api/files?${params}`, { headers: await authHeaders(), cache: "no-store" });
  if (!response.ok) throw await readError(response);
  return ((await response.json()) as { files: FileView[] }).files;
}

export async function uploadFile(category: FileCategory, entityId: string, file: Blob, name: string): Promise<FileView> {
  const form = new FormData();
  form.set("category", category);
  form.set("entityId", entityId);
  form.set("file", file, name);
  const response = await fetch("/api/files", { method: "POST", headers: await authHeaders(), body: form });
  if (!response.ok) throw await readError(response);
  return ((await response.json()) as { file: FileView }).file;
}

export async function deleteFile(id: string): Promise<void> {
  const response = await fetch(`/api/files/${id}`, { method: "DELETE", headers: await authHeaders() });
  if (!response.ok) throw await readError(response);
}

/**
 * Réduit une photo avant l'envoi (bord max 1600 px, JPEG 82 %) : moins de
 * données mobiles, envoi plus rapide, toujours sous la limite du serveur.
 * Convertit aussi les formats que le serveur refuse (HEIC des iPhone) quand
 * le navigateur sait les lire. En cas d'échec, le fichier d'origine part tel
 * quel et le serveur tranche.
 */
export async function compressPhoto(file: File, maxEdge = 1600, quality = 0.82): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    return blob && (blob.size < file.size || file.type !== "image/jpeg") ? blob : file;
  } catch {
    return file;
  }
}

/** Octets d'une photo (même origine), pour la partager depuis le téléphone. */
export async function fetchPhotoBlob(id: string): Promise<Blob> {
  const response = await fetch(`/api/files/${id}`, { headers: await authHeaders(), cache: "no-store" });
  if (!response.ok) throw await readError(response);
  return response.blob();
}
