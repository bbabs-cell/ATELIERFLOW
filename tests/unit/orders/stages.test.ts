import { describe, expect, it } from "vitest";
import { nextStage, previousStage, stageOf, statusForStage } from "@/domain/orders/stages";
import { ORDER_STATUSES, type OrderStatus } from "@/domain/orders/order";

describe("commandes en 4 étapes", () => {
  it("chaque statut enregistré tombe dans une étape (annulée : aucune)", () => {
    const expected: Record<OrderStatus, string | null> = {
      REGISTERED: "RECEIVED",
      FABRIC_RECEIVED: "RECEIVED",
      PREPARATION: "SEWING",
      SEWING: "SEWING",
      FITTING: "SEWING",
      ALTERATION: "SEWING",
      COMPLETED: "READY",
      READY_FOR_PICKUP: "READY",
      DELIVERED: "DELIVERED",
      CANCELLED: null,
    };
    for (const s of ORDER_STATUSES) expect(stageOf(s)).toBe(expected[s]);
  });

  it("un seul toucher fait avancer : Reçue → En couture → Prête → Livrée", () => {
    expect(nextStage("REGISTERED")).toBe("SEWING");
    expect(statusForStage("REGISTERED", "SEWING")).toBe("SEWING");
    expect(nextStage("SEWING")).toBe("READY");
    expect(statusForStage("SEWING", "READY")).toBe("READY_FOR_PICKUP");
    expect(nextStage("READY_FOR_PICKUP")).toBe("DELIVERED");
    expect(statusForStage("READY_FOR_PICKUP", "DELIVERED")).toBe("DELIVERED");
    expect(nextStage("DELIVERED")).toBeNull();
    expect(nextStage("CANCELLED")).toBeNull();
  });

  it("les commandes anciennes à une étape intermédiaire avancent aussi", () => {
    expect(statusForStage("FABRIC_RECEIVED", "SEWING")).toBe("SEWING");
    expect(statusForStage("FITTING", "READY")).toBe("READY_FOR_PICKUP");
    expect(statusForStage("ALTERATION", "READY")).toBe("READY_FOR_PICKUP");
    expect(statusForStage("COMPLETED", "DELIVERED")).toBe("DELIVERED");
  });

  it("revenir d'une étape pour corriger un toucher par erreur, jamais après la livraison", () => {
    expect(previousStage("SEWING")).toBe("RECEIVED");
    expect(statusForStage("SEWING", "RECEIVED")).toBe("REGISTERED");
    expect(previousStage("FITTING")).toBe("RECEIVED");
    expect(previousStage("READY_FOR_PICKUP")).toBe("SEWING");
    expect(statusForStage("READY_FOR_PICKUP", "SEWING")).toBe("SEWING");
    expect(previousStage("REGISTERED")).toBeNull();
    expect(previousStage("DELIVERED")).toBeNull();
    expect(statusForStage("READY_FOR_PICKUP", "RECEIVED")).toBeNull();
  });
});
