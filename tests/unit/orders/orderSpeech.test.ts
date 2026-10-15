import { describe, expect, it } from "vitest";
import { orderSpeech } from "@/features/orders/orderSpeech";

const TODAY = "2026-10-02T09:00:00.000Z";

describe("lecture à voix haute d'une commande", () => {
  it("dit le client, l'habit, l'étape, l'échéance et le prix", () => {
    const text = orderSpeech({ status: "SEWING", expected_at: "2026-10-03", total_price: 25000 }, "Awa Diop", "Boubou bazin", TODAY);
    expect(text).toMatch(/^Commande de Awa Diop\. Boubou bazin\. En couture\. On coud l'habit\. À livrer : demain\. Prix : 25\s000\sfrancs CFA\.$/);
  });

  it("annonce le retard", () => {
    const text = orderSpeech({ status: "REGISTERED", expected_at: "2026-09-30", total_price: 1000 }, null, null, TODAY);
    expect(text).toContain("Commande de client");
    expect(text).toContain("Reçue");
    expect(text).toContain("En retard de 2 jours");
  });
});
