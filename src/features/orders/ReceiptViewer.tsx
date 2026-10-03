"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CloudCheck, CloudUpload, Download, MessageCircle, Pencil, Printer, Share2 } from "lucide-react";
import { Button, Dialog, Field, Input, StateView, Textarea } from "@/ui";
import {
  buildReceiptDocument,
  receiptFileName,
  receiptShareMessage,
  receiptWhatsappUrl,
  type AtelierIdentity,
  type ReceiptDocument,
} from "@/domain/orders/receiptDocument";
import { IDENTITY_LIMITS, validateIdentity, type IdentityErrors } from "@/domain/tenant/identity";
import { peekActiveSession } from "@/application/auth/session";
import type { ReceiptSources } from "@/application/orders/receiptService";
import { getOrdersFacade } from "./facade";
import { ReceiptSheet } from "./ReceiptSheet";
import { useAtelierIdentity } from "./useAtelierIdentity";
import { FilesClientError, listFiles, uploadFile } from "@/infrastructure/files/filesClient";

type ArchiveState = "idle" | "archiving" | "archived" | "unavailable" | "error";

export interface ReceiptViewerProps {
  receiptId: string | null;
  onClose: () => void;
}

async function buildPdfFile(doc: ReceiptDocument): Promise<File> {
  // pdf-lib n'est chargé qu'au premier PDF (pas dans le bundle initial).
  const { renderReceiptPdf } = await import("@/infrastructure/receipts/receiptPdf");
  const bytes = await renderReceiptPdf(doc);
  return new File([bytes as BlobPart], receiptFileName(doc), { type: "application/pdf" });
}

function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function ReceiptViewer({ receiptId, onClose }: ReceiptViewerProps) {
  const [sources, setSources] = useState<ReceiptSources | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"pdf" | "share" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const { identity, canEdit, save } = useAtelierIdentity();

  useEffect(() => {
    // Précharge le moteur PDF dès l'ouverture : une fois mis en cache par le
    // service worker, le PDF se génère aussi hors connexion.
    void import("@/infrastructure/receipts/receiptPdf").catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!receiptId) return;
    let cancelled = false;
    void (async () => {
      setSources(null);
      setLoadError(null);
      setActionError(null);
      try {
        const found = await getOrdersFacade().receipts.receiptSources(receiptId);
        if (cancelled) return;
        if (found) setSources(found);
        else setLoadError("Reçu introuvable sur cet appareil.");
      } catch {
        if (!cancelled) setLoadError("Impossible de charger le reçu.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [receiptId]);

  const doc = useMemo(() => {
    if (!sources) return null;
    const demo = peekActiveSession()?.mode === "DEMO";
    return buildReceiptDocument({
      receipt: sources.receipt,
      order: sources.order,
      items: sources.items,
      customer: sources.customer,
      payment: sources.payment,
      atelier: identity ?? { name: "Mon atelier", phone: null, address: null, footer: null },
      // En démo il n'y a pas de serveur : la référence locale est la référence.
      provisional: !demo && !sources.settled,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  }, [sources, identity]);

  const canShareFiles = typeof navigator !== "undefined" && typeof navigator.canShare === "function";

  // Archivage du PDF dans le stockage privé (R2), une seule fois, quand la
  // référence est confirmée par le serveur et les coordonnées connues.
  const [archive, setArchive] = useState<ArchiveState>("idle");
  const archiveReady = doc !== null && !doc.provisional && identity !== null && peekActiveSession()?.mode !== "DEMO";
  useEffect(() => {
    if (!archiveReady || !doc || !sources) return;
    let cancelled = false;
    void (async () => {
      try {
        const existing = await listFiles("RECEIPT", sources.receipt.id);
        if (cancelled) return;
        if (existing.length > 0) {
          setArchive("archived");
          return;
        }
        setArchive("archiving");
        const file = await buildPdfFile(doc);
        await uploadFile("RECEIPT", sources.receipt.id, file, file.name);
        if (!cancelled) setArchive("archived");
      } catch (error) {
        if (cancelled) return;
        const code = error instanceof FilesClientError ? error.code : "";
        if (code === "ALREADY_ARCHIVED") setArchive("archived");
        else if (code === "FILES_NOT_PROVISIONED" || code === "OFFLINE" || code.startsWith("FORBIDDEN")) setArchive("unavailable");
        else setArchive("error");
      }
    })();
    return () => {
      cancelled = true;
    };
    // Une tentative par reçu ouvert (doc change avec l'identité : déjà prise en compte par archiveReady).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archiveReady, sources?.receipt.id]);

  async function downloadPdf() {
    if (!doc) return;
    setBusy("pdf");
    setActionError(null);
    try {
      downloadFile(await buildPdfFile(doc));
    } catch {
      setActionError(
        navigator.onLine
          ? "La génération du PDF a échoué. Réessayez."
          : "PDF indisponible hors connexion sur cet appareil : utilisez « Imprimer » ou réessayez une fois en ligne.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function sharePdf() {
    if (!doc) return;
    setBusy("share");
    setActionError(null);
    try {
      const file = await buildPdfFile(doc);
      const payload = { files: [file], title: `${doc.title} ${doc.reference}`, text: receiptShareMessage(doc) };
      if (navigator.canShare?.(payload)) {
        await navigator.share(payload);
      } else {
        // Partage de fichiers indisponible (ordinateur) : téléchargement.
        downloadFile(file);
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setActionError("Le partage a échoué. Téléchargez le PDF puis envoyez-le.");
      }
    } finally {
      setBusy(null);
    }
  }

  function print() {
    window.print();
  }

  return (
    <>
      <Dialog
        open={receiptId !== null}
        onClose={onClose}
        title={doc ? doc.title : "Reçu"}
        size="lg"
        footer={
          doc ? (
            <>
              <Button type="button" variant="ghost" onClick={print}>
                <Printer className="size-4" aria-hidden="true" />
                Imprimer
              </Button>
              <a
                href={receiptWhatsappUrl(doc.customer.phone, receiptShareMessage(doc))}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-menthe-600 px-5 text-sm font-semibold text-white shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lift"
              >
                <MessageCircle className="size-4" aria-hidden="true" />
                WhatsApp
              </a>
              {canShareFiles ? (
                <Button type="button" variant="secondary" onClick={() => void sharePdf()} loading={busy === "share"} disabled={busy !== null}>
                  <Share2 className="size-4" aria-hidden="true" />
                  Partager le PDF
                </Button>
              ) : null}
              <Button type="button" onClick={() => void downloadPdf()} loading={busy === "pdf"} disabled={busy !== null}>
                <Download className="size-4" aria-hidden="true" />
                Télécharger le PDF
              </Button>
            </>
          ) : null
        }
      >
        {loadError ? (
          <StateView variant="error" title={loadError} />
        ) : !doc ? (
          <StateView variant="loading" title="Préparation du reçu…" />
        ) : (
          <div className="flex flex-col gap-3">
            {archive === "archived" || archive === "archiving" ? (
              <p className={archive === "archived" ? "flex items-center gap-1.5 self-start text-xs font-semibold text-menthe-600 animate-fade-up" : "flex items-center gap-1.5 self-start text-xs text-ink-soft"}>
                {archive === "archived" ? <CloudCheck className="size-4" aria-hidden="true" /> : <CloudUpload className="size-4 animate-pulse" aria-hidden="true" />}
                {archive === "archived" ? "PDF archivé dans le stockage sécurisé de l'atelier" : "Archivage du PDF…"}
              </p>
            ) : null}
            {actionError ? (
              <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
                {actionError}
              </p>
            ) : null}
            {identity === null ? (
              <p className="rounded-lg bg-champagne-100 px-3 py-2 text-xs text-chocolat-700">
                Coordonnées de l&apos;atelier pas encore chargées sur cet appareil : reconnectez-vous une fois en ligne.
              </p>
            ) : null}
            {canEdit ? (
              editing ? (
                <IdentityForm
                  initial={identity ?? { name: "", phone: null, address: null, footer: null }}
                  onCancel={() => setEditing(false)}
                  onSave={async (next) => {
                    await save(next);
                    setEditing(false);
                  }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="inline-flex min-h-9 items-center gap-1.5 self-end rounded-full px-3 py-1 text-xs font-semibold text-flamme-700 pointer-coarse:min-h-11 transition-colors hover:bg-flamme-50"
                >
                  <Pencil className="size-3.5" aria-hidden="true" />
                  Coordonnées de l&apos;atelier
                </button>
              )
            ) : null}
            <ReceiptSheet doc={doc} className="animate-scale-in" />
          </div>
        )}
      </Dialog>
      {doc && receiptId !== null
        ? createPortal(
            <div id="receipt-print-root" aria-hidden="true">
              <ReceiptSheet doc={doc} />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function IdentityForm({
  initial,
  onCancel,
  onSave,
}: {
  initial: AtelierIdentity;
  onCancel: () => void;
  onSave: (identity: AtelierIdentity) => Promise<void>;
}) {
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<IdentityErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    const result = validateIdentity(draft);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setFailure(null);
    setSaving(true);
    try {
      await onSave(result.value);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setFailure(
        message === "FORBIDDEN"
          ? "Seul le propriétaire peut modifier les coordonnées de l'atelier."
          : "Enregistrement impossible. Vérifiez la connexion puis réessayez.",
      );
    } finally {
      setSaving(false);
    }
  }

  const set = (key: keyof AtelierIdentity) => (value: string) => setDraft((d) => ({ ...d, [key]: key === "name" ? value : value || null }));

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-outline bg-surface-2/80 p-4 animate-fade-up">
      <p className="text-sm font-semibold text-ink">En-tête des reçus</p>
      {failure ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          {failure}
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Nom de l'atelier" required htmlFor="atelier-name" error={errors.name}>
          <Input id="atelier-name" value={draft.name} maxLength={IDENTITY_LIMITS.name} onChange={(e) => set("name")(e.target.value)} invalid={Boolean(errors.name)} />
        </Field>
        <Field label="Téléphone" htmlFor="atelier-phone" error={errors.phone}>
          <Input id="atelier-phone" inputMode="tel" value={draft.phone ?? ""} maxLength={IDENTITY_LIMITS.phone} placeholder="+221 77 000 00 00" onChange={(e) => set("phone")(e.target.value)} />
        </Field>
      </div>
      <Field label="Adresse" htmlFor="atelier-address" error={errors.address}>
        <Input id="atelier-address" value={draft.address ?? ""} maxLength={IDENTITY_LIMITS.address} placeholder="Quartier, ville" onChange={(e) => set("address")(e.target.value)} />
      </Field>
      <Field label="Mention en bas du reçu" htmlFor="atelier-footer" error={errors.footer}>
        <Textarea id="atelier-footer" rows={2} value={draft.footer ?? ""} maxLength={IDENTITY_LIMITS.footer} placeholder="Horaires, conditions de retrait…" onChange={(e) => set("footer")(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          Annuler
        </Button>
        <Button type="button" size="sm" onClick={() => void submit()} loading={saving}>
          Enregistrer
        </Button>
      </div>
    </div>
  );
}
