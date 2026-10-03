import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { paymentAlertContent, sendPaymentAlert } = await import("@/infrastructure/notify/paymentAlert");

const ALERT = {
  amount: 30000,
  currency: "XOF",
  months: 3,
  planCode: "PRO",
  methodLabel: "Wave",
  countryName: "Sénégal",
  senderName: "Awa <Diop>",
  reference: "WV-123",
  origin: "https://atelier.example.com",
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("alerte e-mail de preuve de paiement", () => {
  it("contenu lisible, échappé, avec le lien de vérification", () => {
    const c = paymentAlertContent(ALERT);
    expect(c.subject).toBe("Preuve de paiement reçue : 30 000 F CFA (PRO, 3 mois)");
    expect(c.text).toContain("Expéditeur : Awa <Diop>");
    expect(c.html).toContain("Awa &#60;Diop&#62;");
    expect(c.html).toContain("https://atelier.example.com/plateforme");
  });

  it("sans configuration : rien n'est envoyé", async () => {
    const fetcher = vi.fn();
    expect(await sendPaymentAlert(ALERT, fetcher as unknown as typeof fetch)).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("envoi via Resend au destinataire configuré ; un échec ne lève pas", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("PLATFORM_ALERT_EMAIL", "admin@example.com");
    const fetcher = vi.fn(async () => new Response("{}", { status: 200 }));
    expect(await sendPaymentAlert(ALERT, fetcher as unknown as typeof fetch)).toBe(true);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(JSON.parse(String(init.body)).to).toEqual(["admin@example.com"]);
    const failing = vi.fn(async () => {
      throw new Error("réseau");
    });
    expect(await sendPaymentAlert(ALERT, failing as unknown as typeof fetch)).toBe(false);
  });
});
