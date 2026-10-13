import { describe, expect, it } from "vitest";
import { isForeignOriginWrite } from "@/infrastructure/http/origin";

const h = (init: Record<string, string>) => new Headers(init);

describe("contrôle d'origine des écritures", () => {
  it("accepte une écriture de notre propre site", () => {
    expect(isForeignOriginWrite("POST", h({ origin: "https://atelier.magyapro.com", host: "atelier.magyapro.com" }))).toBe(false);
    expect(isForeignOriginWrite("DELETE", h({ origin: "https://atelier.magyapro.com", "x-forwarded-host": "atelier.magyapro.com", host: "interne" }))).toBe(false);
  });

  it("refuse une écriture envoyée par un autre site, même un sous-domaine", () => {
    expect(isForeignOriginWrite("POST", h({ origin: "https://pirate.example", host: "atelier.magyapro.com" }))).toBe(true);
    expect(isForeignOriginWrite("POST", h({ origin: "https://vitrine.magyapro.com", host: "atelier.magyapro.com" }))).toBe(true);
    expect(isForeignOriginWrite("PATCH", h({ origin: "null", host: "atelier.magyapro.com" }))).toBe(true);
  });

  it("sans Origin (tâche planifiée, serveur) ou en lecture : laissé passer", () => {
    expect(isForeignOriginWrite("POST", h({ host: "atelier.magyapro.com" }))).toBe(false);
    expect(isForeignOriginWrite("GET", h({ origin: "https://pirate.example", host: "atelier.magyapro.com" }))).toBe(false);
  });
});
