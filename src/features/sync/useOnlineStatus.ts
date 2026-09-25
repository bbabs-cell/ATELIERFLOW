"use client";

import { useEffect, useState } from "react";
import { createOnlineDetector, isOnline } from "@/infrastructure/network/onlineDetector";

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(() => isOnline());

  useEffect(() => {
    return createOnlineDetector({
      onOnline: () => setOnline(true),
      onOffline: () => setOnline(false),
    });
  }, []);

  return online;
}