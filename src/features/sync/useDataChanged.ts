"use client";

import { useEffect, useRef } from "react";
import { DATA_CHANGED_EVENT } from "./useSyncRunner";

/** Recharge un écran quand la synchronisation a apporté des données du serveur. */
export function useDataChanged(reload: () => unknown): void {
  const ref = useRef(reload);
  useEffect(() => {
    ref.current = reload;
  }, [reload]);
  useEffect(() => {
    const handler = () => {
      void ref.current();
    };
    window.addEventListener(DATA_CHANGED_EVENT, handler);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, handler);
  }, []);
}
