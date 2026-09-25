"use client";

import { useEffect, useRef, useState } from "react";
import { ServiceWorkerController } from "@/infrastructure/pwa/register";
import { OfflineBanner } from "./OfflineBanner";
import { UpdatePrompt } from "./UpdatePrompt";

export interface PwaProviderProps {
  children: React.ReactNode;
}

export function PwaProvider({ children }: PwaProviderProps): React.ReactElement {
  const controllerRef = useRef<ServiceWorkerController | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);

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
      ) : null}
      {children}
    </>
  );
}