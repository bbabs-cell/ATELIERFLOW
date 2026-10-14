import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServiceWorkerController } from "@/infrastructure/pwa/register";

type Listener = () => void;

function fakeServiceWorker(controller: object | null, waiting: { state: string; postMessage: ReturnType<typeof vi.fn> } | null = null) {
  const listeners: Listener[] = [];
  const registration = { waiting, installing: null, addEventListener: vi.fn() };
  const sw = {
    controller,
    addEventListener: (_: string, fn: Listener) => listeners.push(fn),
    removeEventListener: vi.fn(),
    register: vi.fn(async () => registration),
  };
  return { sw, fire: () => listeners.forEach((fn) => fn()) };
}

describe("service worker : pas de rechargement surprise", () => {
  const reload = vi.fn();
  beforeEach(() => {
    vi.useFakeTimers();
    reload.mockReset();
    vi.stubGlobal("window", { location: { reload }, setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms) });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("première installation : il prend la main sans recharger la page (écran blanc au démarrage)", async () => {
    const { sw, fire } = fakeServiceWorker(null);
    vi.stubGlobal("navigator", { serviceWorker: sw });
    await new ServiceWorkerController({}).start();
    fire();
    vi.runAllTimers();
    expect(reload).not.toHaveBeenCalled();
  });

  it("mise à jour prête : proposée, jamais activée d'office", async () => {
    const waiting = { state: "installed", postMessage: vi.fn() };
    const { sw } = fakeServiceWorker({}, waiting);
    vi.stubGlobal("navigator", { serviceWorker: sw });
    const onUpdateAvailable = vi.fn();
    await new ServiceWorkerController({ onUpdateAvailable }).start();
    expect(onUpdateAvailable).toHaveBeenCalledOnce();
    expect(waiting.postMessage).not.toHaveBeenCalled();
  });

  it("mise à jour acceptée : activée puis la page se recharge une seule fois", async () => {
    const waiting = { state: "installed", postMessage: vi.fn() };
    const { sw, fire } = fakeServiceWorker({}, waiting);
    vi.stubGlobal("navigator", { serviceWorker: sw });
    const controller = new ServiceWorkerController({});
    await controller.start();
    controller.applyUpdate();
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    fire();
    fire();
    vi.runAllTimers();
    expect(reload).toHaveBeenCalledOnce();
  });
});
