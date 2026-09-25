export interface ServiceWorkerControllerHandlers {
  onUpdateAvailable?: () => void;
  onControllerChange?: () => void;
}

export class ServiceWorkerController {
  private registration: ServiceWorkerRegistration | null = null;
  private disposed = false;
  private reloading = false;
  private readonly swUrl: string;
  private readonly handlers: ServiceWorkerControllerHandlers;

  constructor(handlers: ServiceWorkerControllerHandlers, swUrl = "/sw.js") {
    this.handlers = handlers;
    this.swUrl = swUrl;
  }

  async start(): Promise<void> {
    if (
      typeof navigator === "undefined" ||
      !("serviceWorker" in navigator) ||
      typeof window === "undefined"
    ) {
      return;
    }
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      this.handleControllerChange,
    );
    const registration = await navigator.serviceWorker.register(this.swUrl);
    if (this.disposed) return;
    this.registration = registration;

    if (navigator.serviceWorker.controller) {
      if (registration.waiting) {
        this.promptSkipWaiting(registration.waiting);
      }
      registration.addEventListener("updatefound", () =>
        this.monitorInstalling(registration.installing),
      );
    } else {
      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        if (installing) {
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed") {
              this.sendSkipWaiting(installing);
            }
          });
        }
      });
      if (registration.waiting) {
        this.sendSkipWaiting(registration.waiting);
      }
    }
  }

  applyUpdate(): void {
    const waiting = this.registration?.waiting;
    if (waiting) {
      this.sendSkipWaiting(waiting);
    } else {
      window.location.reload();
    }
  }

  stop(): void {
    this.disposed = true;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    navigator.serviceWorker.removeEventListener(
      "controllerchange",
      this.handleControllerChange,
    );
  }

  private monitorInstalling(installing: ServiceWorker | null): void {
    if (!installing) return;
    installing.addEventListener("statechange", () => {
      if (installing.state === "installed" && navigator.serviceWorker.controller) {
        this.promptSkipWaiting(installing);
      }
    });
  }

  private promptSkipWaiting(worker: ServiceWorker): void {
    this.handlers.onUpdateAvailable?.();
    this.sendSkipWaiting(worker);
  }

  private sendSkipWaiting(worker: ServiceWorker): void {
    if (worker.state === "installed") {
      worker.postMessage({ type: "SKIP_WAITING" });
    }
  }

  private handleControllerChange = (): void => {
    if (this.reloading || this.disposed) return;
    this.reloading = true;
    this.handlers.onControllerChange?.();
    window.setTimeout(() => window.location.reload(), 0);
  };
}