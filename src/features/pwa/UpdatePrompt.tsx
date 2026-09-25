"use client";

import { RefreshCw, X } from "lucide-react";
import { Button } from "@/ui";

export interface UpdatePromptProps {
  onApply: () => void;
  onDismiss: () => void;
}

export function UpdatePrompt({
  onApply,
  onDismiss,
}: UpdatePromptProps): React.ReactElement {
  return (
    <div
      role="alertdialog"
      aria-label="Mise à jour disponible"
      className="fixed inset-x-0 bottom-4 z-50 mx-auto flex w-[calc(100%-2rem)] max-w-md flex-col gap-3 rounded-lg border border-outline bg-surface p-4 shadow-lg"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-info-soft text-info">
            <RefreshCw className="size-4" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-medium text-ink">
              Nouvelle version disponible
            </p>
            <p className="text-sm text-ink-soft">
              Mettez à jour pour profiter des derniers correctifs. Vos données
              locales sont conservées.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Fermer"
          className="rounded-md p-1 text-ink-faint transition-colors hover:bg-beige-100 hover:text-ink"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          Plus tard
        </Button>
        <Button size="sm" onClick={onApply}>
          Mettre à jour
        </Button>
      </div>
    </div>
  );
}