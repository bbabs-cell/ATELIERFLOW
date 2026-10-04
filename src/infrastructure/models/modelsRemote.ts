import type { DesignModel, ModelDraft } from "@/domain/models/designModels";
import { getSupabaseBrowserClient } from "@/infrastructure/supabase/browserClient";

/** Galerie des modèles sur Supabase : lecture (RLS) et écritures par RPC (0027). */
export class ModelsError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function codeOf(message: string | undefined): string {
  const match = /((?:FORBIDDEN|VALIDATION|NOT_FOUND):[\w.]+)/.exec(message ?? "");
  return match ? match[1] : "MODELS_ERROR";
}

function client() {
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new ModelsError("OFFLINE");
  const c = getSupabaseBrowserClient();
  if (!c) throw new ModelsError("OFFLINE");
  return c;
}

export async function listModels(): Promise<DesignModel[]> {
  const { data, error } = await client()
    .from("design_models")
    .select("*")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(500);
  if (error) throw new ModelsError(codeOf(error.message));
  return (data ?? []) as DesignModel[];
}

export async function saveModel(id: string | null, draft: ModelDraft): Promise<DesignModel> {
  const { data, error } = await client().rpc("upsert_design_model", {
    p_id: id,
    p_title: draft.title,
    p_category: draft.category,
    p_description: draft.description,
    p_price: draft.price,
  });
  if (error) throw new ModelsError(codeOf(error.message));
  return data as DesignModel;
}

export async function deleteModel(id: string): Promise<void> {
  const { error } = await client().rpc("delete_design_model", { p_id: id });
  if (error) throw new ModelsError(codeOf(error.message));
}
