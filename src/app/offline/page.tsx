"use client";

import { WifiOff } from "lucide-react";
import { Button } from "@/ui";

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-ivoire-50 px-4">
      <div className="flex w-full max-w-md flex-col items-center gap-5 rounded-lg border border-outline bg-surface p-8 text-center shadow-sm">
        <span className="flex size-14 items-center justify-center rounded-full bg-warning-soft text-warning">
          <WifiOff className="size-7" aria-hidden="true" />
        </span>
        <div>
          <h1 className="font-display text-3xl text-ink">Vous êtes hors ligne</h1>
          <p className="mt-2 text-sm text-ink-soft">
            La connexion a été interrompue. Les appareils d&apos;atelier
            continuent de fonctionner localement : vos saisies sont enregistrées
            et seront synchronisées dès que le réseau revient.
          </p>
        </div>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Réessayer
        </Button>
      </div>
    </main>
  );
}