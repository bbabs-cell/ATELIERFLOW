"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Trash2 } from "lucide-react";
import { Button, Dialog, HIDDEN_FILE_INPUT } from "@/ui";
import { cx } from "@/lib/cx";
import { fileErrorMessage, MAX_FILES_PER_ENTITY, type FileCategory, type FileView } from "@/domain/files/files";
import { can, TENANT_ROLE_CODES, type TenantRoleCode } from "@/domain/team/roles";
import { peekActiveSession } from "@/application/auth/session";
import { compressPhoto, deleteFile, FilesClientError, listFiles, uploadFile } from "@/infrastructure/files/filesClient";

export interface PhotoGalleryProps {
  category: Exclude<FileCategory, "RECEIPT">;
  entityId: string;
  title?: string;
  className?: string;
}

function roleCan(permission: "files.read" | "files.write"): boolean {
  const role = peekActiveSession()?.role ?? null;
  return role !== null && (TENANT_ROLE_CODES as readonly string[]).includes(role) && can(role as TenantRoleCode, permission);
}

function codeOf(error: unknown): string {
  return error instanceof FilesClientError ? error.code : "FILES_ERROR";
}

/**
 * Photos d'une fiche (client, commande, tissu), stockées dans R2 :
 * vignettes chargées par liens signés, ajout depuis l'appareil photo ou la
 * galerie (photo réduite avant l'envoi), suppression logique.
 */
export function PhotoGallery({ category, entityId, title = "Photos", className }: PhotoGalleryProps) {
  const [files, setFiles] = useState<FileView[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(0);
  const [viewing, setViewing] = useState<FileView | null>(null);
  const [deleting, setDeleting] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const demo = peekActiveSession()?.mode === "DEMO";
  const canWrite = roleCan("files.write");

  const load = useCallback(async () => {
    try {
      setFiles(await listFiles(category, entityId));
      setUnavailable(null);
    } catch (e) {
      const code = codeOf(e);
      if (code === "FILES_NOT_PROVISIONED" || code === "OFFLINE") setUnavailable(fileErrorMessage(code));
      else setError(fileErrorMessage(code));
    } finally {
      setLoading(false);
    }
  }, [category, entityId]);

  useEffect(() => {
    if (demo) return;
    void (async () => {
      await load();
    })();
  }, [load, demo]);

  async function onPick(list: FileList | null) {
    if (!list || list.length === 0) return;
    setError(null);
    const picked = Array.from(list).slice(0, Math.max(0, MAX_FILES_PER_ENTITY - files.length));
    setUploading(picked.length);
    for (const file of picked) {
      try {
        const blob = await compressPhoto(file);
        const view = await uploadFile(category, entityId, blob, file.name || "photo.jpg");
        setFiles((current) => [...current, view]);
      } catch (e) {
        setError(fileErrorMessage(codeOf(e)));
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (input.current) input.current.value = "";
  }

  async function remove(file: FileView) {
    setDeleting(true);
    try {
      await deleteFile(file.id);
      setFiles((current) => current.filter((f) => f.id !== file.id));
      setViewing(null);
    } catch (e) {
      setError(fileErrorMessage(codeOf(e)));
    } finally {
      setDeleting(false);
    }
  }

  if (demo) {
    return (
      <section className={cx("rounded-xl border border-dashed border-outline bg-surface-2/60 p-4 text-sm text-ink-soft", className)}>
        Photos disponibles une fois connecté à votre atelier (pas en mode démo).
      </section>
    );
  }

  return (
    <section className={cx("rounded-xl border border-outline bg-surface-2/80 p-4", className)} aria-label={title}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-display text-lg text-ink">
          <span className="grid size-8 place-items-center rounded-full bg-sunset-gradient text-white shadow-soft">
            <Camera className="size-4" aria-hidden="true" />
          </span>
          {title}
          {files.length > 0 ? (
            <span key={files.length} className="grid min-w-6 place-items-center rounded-full bg-flamme-100 px-1.5 text-xs font-bold text-flamme-700 animate-pop">
              {files.length}
            </span>
          ) : null}
        </h3>
        {canWrite && !unavailable ? (
          <>
            <input
              ref={input}
              type="file"
              accept="image/*"
              multiple
              className={HIDDEN_FILE_INPUT}
              id={`photo-input-${entityId}`}
              onChange={(e) => void onPick(e.target.files)}
            />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => input.current?.click()}
              loading={uploading > 0}
              disabled={files.length >= MAX_FILES_PER_ENTITY}
            >
              <ImagePlus className="size-4" aria-hidden="true" />
              Ajouter
            </Button>
          </>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="mt-3 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {unavailable ? (
        <p className="mt-3 text-sm text-ink-soft">{unavailable}</p>
      ) : loading ? (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton-shimmer aspect-square rounded-xl" />
          ))}
        </div>
      ) : files.length === 0 && uploading === 0 ? (
        canWrite ? (
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="mt-3 flex w-full flex-col items-center gap-1 rounded-xl border-2 border-dashed border-flamme-200 px-4 py-6 text-sm text-ink-soft transition-all duration-300 hover:-translate-y-0.5 hover:border-flamme-400 hover:bg-flamme-50"
          >
            <ImagePlus className="size-6 text-flamme-500 animate-float" aria-hidden="true" />
            Prendre ou choisir une photo
          </button>
        ) : (
          <p className="mt-3 text-sm text-ink-soft">Aucune photo.</p>
        )
      ) : (
        <ul className="stagger mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {files.map((file) => (
            <li key={file.id} className="animate-scale-in">
              <button
                type="button"
                onClick={() => setViewing(file)}
                className="group block aspect-square w-full overflow-hidden rounded-xl border border-outline bg-surface shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lift"
                aria-label="Agrandir la photo"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- lien signé R2, hors optimiseur d'images */}
                <img src={file.url} alt="" loading="lazy" className="size-full object-cover transition-transform duration-500 group-hover:scale-110" />
              </button>
            </li>
          ))}
          {Array.from({ length: uploading }, (_, i) => (
            <li key={`up-${i}`} className="skeleton-shimmer aspect-square rounded-xl" aria-label="Envoi en cours" />
          ))}
        </ul>
      )}

      <Dialog
        open={viewing !== null}
        onClose={() => setViewing(null)}
        title={title}
        size="lg"
        footer={
          viewing && canWrite ? (
            <Button type="button" variant="danger" onClick={() => void remove(viewing)} loading={deleting}>
              <Trash2 className="size-4" aria-hidden="true" />
              Retirer la photo
            </Button>
          ) : undefined
        }
      >
        {viewing ? (
          // eslint-disable-next-line @next/next/no-img-element -- lien signé R2
          <img src={viewing.url} alt="" className="mx-auto max-h-[60vh] w-auto rounded-xl object-contain animate-scale-in" />
        ) : null}
      </Dialog>
    </section>
  );
}
