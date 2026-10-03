"use client";

import { useId, useState } from "react";
import { ImagePlus, Trash2, UserRound } from "lucide-react";
import { Button, StateView } from "@/ui";
import { cx } from "@/lib/cx";
import { peekActiveSession } from "@/application/auth/session";
import { can, type TenantRoleCode } from "@/domain/team/roles";
import {
  BRANDING_LABELS,
  BRANDING_MAX_EDGE,
  brandingErrorMessage,
  MAX_BRANDING_BYTES,
  type BrandingKind,
  type BrandingUrls,
} from "@/domain/branding/branding";
import { compressPhoto } from "@/infrastructure/files/filesClient";
import { BrandingError, removeBranding, uploadBranding } from "@/infrastructure/branding/brandingClient";
import { setBrandingUrls, useBranding } from "./useBranding";

const FIELD: Record<BrandingKind, keyof BrandingUrls> = { AVATAR: "avatar", LOGO: "logo", COVER: "cover" };

const HINTS: Record<BrandingKind, string> = {
  AVATAR: "Affichée dans le menu, à côté de votre nom.",
  LOGO: "Remplace l'icône de l'application en haut du menu. Une image carrée rend le mieux.",
  COVER: "Affichée en fond du menu, légèrement floutée. Une photo de l'atelier ou de vos créations.",
};

/**
 * Personnalisation : photo de profil (chaque utilisateur), logo et photo
 * de couverture de l'atelier (propriétaire). Les images sont réduites sur
 * l'appareil avant l'envoi.
 */
export function PersonnalisationView(): React.ReactElement {
  const session = peekActiveSession();
  const urls = useBranding(session?.mode === "SUPABASE" ? `${session.tenantId}:${session.profileId}` : null);
  const role = (session?.role ?? null) as TenantRoleCode | null;
  const canManage = role !== null && can(role, "tenant.settings");

  return (
    <div className="@container mx-auto w-full max-w-4xl px-4 py-6 sm:py-10">
      <header className="mb-8">
        <h1 className="page-title text-4xl text-ink sm:text-5xl">Personnalisation</h1>
        <p className="mt-1 text-sm text-ink-soft">Votre photo, le logo et la couverture de l&apos;atelier.</p>
      </header>
      {session?.mode !== "SUPABASE" ? (
        <StateView variant="empty" title="Connexion nécessaire" description="Les images sont enregistrées sur le serveur : connectez-vous en ligne pour les changer." />
      ) : (
        <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-2">
          <ImageCard kind="AVATAR" url={urls.avatar} editable />
          <ImageCard kind="LOGO" url={urls.logo} editable={canManage} />
          <ImageCard kind="COVER" url={urls.cover} editable={canManage} className="@2xl:col-span-2" />
        </div>
      )}
    </div>
  );
}

function ImageCard({ kind, url, editable, className }: { kind: BrandingKind; url: string | null; editable: boolean; className?: string }) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const body = await compressPhoto(file, BRANDING_MAX_EDGE[kind], 0.86);
      if (body.size > MAX_BRANDING_BYTES) throw new BrandingError("VALIDATION:size");
      const next = await uploadBranding(kind, body, file.name || "image.jpg");
      setBrandingUrls({ [FIELD[kind]]: next });
    } catch (e) {
      setError(brandingErrorMessage(e instanceof BrandingError ? e.code : null));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await removeBranding(kind);
      setBrandingUrls({ [FIELD[kind]]: null });
    } catch (e) {
      setError(brandingErrorMessage(e instanceof BrandingError ? e.code : null));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={cx("flex flex-col gap-3 rounded-xl border border-outline bg-surface p-4 shadow-soft", className)}>
      <div>
        <h2 className="font-display text-lg text-ink">{BRANDING_LABELS[kind]}</h2>
        <p className="text-sm text-ink-soft">{HINTS[kind]}</p>
      </div>

      <div
        className={cx(
          "relative grid place-items-center overflow-hidden border border-dashed border-outline bg-surface-2",
          kind === "AVATAR" ? "size-28 rounded-full" : kind === "LOGO" ? "size-28 rounded-2xl" : "aspect-[16/7] w-full rounded-xl",
        )}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- lien signé privé, pas d'optimisation Next
          <img src={url} alt={BRANDING_LABELS[kind]} className={cx("size-full", kind === "LOGO" ? "object-contain p-2" : "object-cover")} />
        ) : kind === "AVATAR" ? (
          <UserRound className="size-10 text-ink-faint" aria-hidden="true" />
        ) : (
          <ImagePlus className="size-8 text-ink-faint" aria-hidden="true" />
        )}
      </div>

      {editable ? (
        <div className="flex flex-wrap gap-2">
          <label
            htmlFor={`${id}-file`}
            className={cx(
              "inline-flex h-11 cursor-pointer items-center gap-2 rounded-full bg-flamme-gradient px-5 text-sm font-semibold text-white shadow-soft transition-all hover:-translate-y-0.5",
              busy && "pointer-events-none opacity-60",
            )}
          >
            <ImagePlus className="size-4" aria-hidden="true" />
            {busy ? "Envoi…" : url ? "Changer" : "Ajouter"}
          </label>
          <input
            id={`${id}-file`}
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void upload(file);
            }}
          />
          {url ? (
            <Button variant="ghost" onClick={() => void remove()} disabled={busy}>
              <Trash2 className="size-4" aria-hidden="true" />
              Retirer
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-ink-faint">Seul le propriétaire de l&apos;atelier peut la changer.</p>
      )}
      {error ? <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p> : null}
    </section>
  );
}
