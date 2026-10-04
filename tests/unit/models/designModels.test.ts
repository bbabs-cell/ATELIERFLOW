import { describe, expect, it } from "vitest";
import {
  filterModels,
  modelCategories,
  modelErrorMessage,
  modelShareText,
  validateModelDraft,
  type DesignModel,
} from "@/domain/models/designModels";

const model = (id: string, title: string, category: string | null, description: string | null = null): DesignModel => ({
  id,
  tenant_id: "t1",
  title,
  category,
  description,
  price: null,
  created_by: null,
  created_at: "2026-10-01T10:00:00Z",
  updated_at: "2026-10-01T10:00:00Z",
  deleted_at: null,
});

describe("modèles de l'atelier", () => {
  it("valide la saisie", () => {
    expect(validateModelDraft({ title: "  Grand   boubou ", category: " Boubou ", description: "", priceInput: "45 000" })).toEqual({
      ok: true,
      value: { title: "Grand boubou", category: "Boubou", description: null, price: 45000 },
    });
    expect(validateModelDraft({ title: "", category: "", description: "", priceInput: "" })).toMatchObject({ ok: false, errors: { title: expect.any(String) } });
    expect(validateModelDraft({ title: "Robe", category: "", description: "", priceInput: "abc" })).toMatchObject({ ok: false, errors: { price: expect.any(String) } });
    expect(validateModelDraft({ title: "x".repeat(121), category: "", description: "", priceInput: "" })).toMatchObject({ ok: false });
  });

  it("catégories sans doublon (accents, majuscules)", () => {
    const list = [model("1", "A", "Boubou"), model("2", "B", "boubou"), model("3", "C", "Robe"), model("4", "D", null)];
    expect(modelCategories(list)).toEqual(["Boubou", "Robe"]);
  });

  it("filtre par catégorie et par texte", () => {
    const list = [model("1", "Grand boubou brodé", "Boubou"), model("2", "Robe sirène", "Robe", "bazin riche"), model("3", "Taille basse", "Ensemble")];
    expect(filterModels(list, "boubou", "").map((m) => m.id)).toEqual(["1"]);
    expect(filterModels(list, null, "BAZIN").map((m) => m.id)).toEqual(["2"]);
    expect(filterModels(list, null, "brode").map((m) => m.id)).toEqual(["1"]);
    expect(filterModels(list, null, "")).toHaveLength(3);
  });

  it("messages et texte de partage", () => {
    expect(modelErrorMessage("FORBIDDEN:orders.write")).toContain("rôle");
    expect(modelErrorMessage("OFFLINE")).toContain("connexion");
    expect(modelShareText({ title: "Grand boubou", price: 45000 }, (n) => `${n} F`, "Atelier Fatou")).toBe("Modèle « Grand boubou » — à partir de 45000 F (Atelier Fatou)");
    expect(modelShareText({ title: "Robe", price: null }, (n) => `${n} F`)).toBe("Modèle « Robe »");
  });
});
