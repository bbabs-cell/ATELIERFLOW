import { parseFcfa } from "@/domain/money";
import { normalizeText } from "@/domain/assistant/text";

/**
 * Galerie « Mes modèles » : les modèles de l'atelier (titre, catégorie,
 * prix indicatif, description) avec leurs photos privées (catégorie MODEL).
 */

export interface DesignModel {
  id: string;
  tenant_id: string;
  title: string;
  category: string | null;
  description: string | null;
  /** Prix indicatif, entier dans la monnaie de l'atelier. */
  price: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export const MODEL_TITLE_MAX = 120;
export const MODEL_CATEGORY_MAX = 60;
export const MODEL_DESCRIPTION_MAX = 1000;

export const MODEL_CATEGORY_SUGGESTIONS: readonly string[] = [
  "Grand boubou",
  "Boubou",
  "Robe",
  "Ensemble pagne",
  "Kaftan",
  "Taille basse",
  "Tenue de mariage",
  "Costume",
  "Chemise",
  "Pantalon",
  "Jupe",
  "Enfant",
];

export interface ModelDraftInput {
  title: string;
  category: string;
  description: string;
  priceInput: string;
}

export interface ModelDraft {
  title: string;
  category: string | null;
  description: string | null;
  price: number | null;
}

export type ModelDraftErrors = Partial<Record<"title" | "category" | "description" | "price", string>>;

export function validateModelDraft(input: ModelDraftInput): { ok: true; value: ModelDraft } | { ok: false; errors: ModelDraftErrors } {
  const errors: ModelDraftErrors = {};
  const title = input.title.replace(/\s+/g, " ").trim();
  const category = input.category.replace(/\s+/g, " ").trim();
  const description = input.description.trim();
  if (!title) errors.title = "Donnez un nom au modèle.";
  else if (title.length > MODEL_TITLE_MAX) errors.title = `${MODEL_TITLE_MAX} caractères au plus.`;
  if (category.length > MODEL_CATEGORY_MAX) errors.category = `${MODEL_CATEGORY_MAX} caractères au plus.`;
  if (description.length > MODEL_DESCRIPTION_MAX) errors.description = `${MODEL_DESCRIPTION_MAX} caractères au plus.`;
  let price: number | null = null;
  if (input.priceInput.trim()) {
    price = parseFcfa(input.priceInput);
    if (price === null || price < 0) errors.price = "Montant invalide (ex : 45 000).";
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { title, category: category || null, description: description || null, price } };
}

/** Catégories présentes, triées (pour les filtres). */
export function modelCategories(models: readonly DesignModel[]): string[] {
  const seen = new Map<string, string>();
  for (const m of models) {
    if (!m.category) continue;
    const key = normalizeText(m.category);
    if (!seen.has(key)) seen.set(key, m.category);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, "fr"));
}

/** Filtre par catégorie (null = toutes) et par texte (titre, catégorie, description). */
export function filterModels(models: readonly DesignModel[], category: string | null, search: string): DesignModel[] {
  const q = normalizeText(search);
  const cat = category ? normalizeText(category) : null;
  return models.filter((m) => {
    if (cat && normalizeText(m.category ?? "") !== cat) return false;
    if (!q) return true;
    return normalizeText(`${m.title} ${m.category ?? ""} ${m.description ?? ""}`).includes(q);
  });
}

export function modelErrorMessage(code: string | null | undefined): string {
  if (!code) return "L'opération a échoué. Réessayez.";
  if (code === "OFFLINE") return "Pas de connexion : la galerie des modèles a besoin d'Internet.";
  if (code.startsWith("FORBIDDEN")) return "Votre rôle ne permet pas de modifier les modèles.";
  if (code.startsWith("NOT_FOUND")) return "Ce modèle n'existe plus.";
  if (code === "VALIDATION:title") return "Donnez un nom au modèle (120 caractères au plus).";
  if (code === "VALIDATION:price") return "Prix invalide.";
  if (code.startsWith("VALIDATION")) return "Vérifiez les informations saisies.";
  return "L'opération a échoué. Réessayez.";
}

/** Texte accompagnant les photos partagées au client. */
export function modelShareText(model: Pick<DesignModel, "title" | "price">, money: (n: number) => string, atelierName?: string | null): string {
  const price = model.price !== null ? ` — à partir de ${money(model.price)}` : "";
  const from = atelierName ? ` (${atelierName})` : "";
  return `Modèle « ${model.title} »${price}${from}`;
}
