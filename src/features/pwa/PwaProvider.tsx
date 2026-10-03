"use client";

import { useEffect, useRef, useState } from "react";
import { ServiceWorkerController } from "@/infrastructure/pwa/register";
import { OfflineBanner } from "./OfflineBanner";
import { UpdatePrompt } from "./UpdatePrompt";
import { useVersionCheck } from "./useVersionCheck";

export interface PwaProviderProps {
  children: React.ReactNode;
}

export function PwaProvider({ children }: PwaProviderProps): React.ReactElement {
  const controllerRef = useRef<ServiceWorkerController | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const version = useVersionCheck();

  useEffect(() => {
    const controller = new ServiceWorkerController({
      onUpdateAvailable: () => setUpdateAvailable(true),
    });
    controllerRef.current = controller;
    void controller.start();
    return () => controller.stop();
  }, []);

  return (
    <>
      <OfflineBanner />
      {updateAvailable ? (
        <UpdatePrompt
          onApply={() => controllerRef.current?.applyUpdate()}
          onDismiss={() => setUpdateAvailable(false)}
        />
      ) : version.updateAvailable ? (
        <UpdatePrompt onApply={() => window.location.reload()} onDismiss={version.dismiss} />
      ) : null}
      {children}
    </>
  );
}