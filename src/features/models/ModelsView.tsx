"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ImagePlus, Pencil, Plus, Search, Share2, Shirt, Trash2 } from "lucide-react";
import { Badge, Button, Dialog, Field, Input, StateView, Textarea } from "@/ui";
import { cx } from "@/lib/cx";
import { peekActiveSession } from "@/application/auth/session";
import { currencySymbol, formatMoney } from "@/domain/money";
import { can, TENANT_ROLE_CODES, type TenantRoleCode } from "@/domain/team/roles";
import type { FileView } from "@/domain/files/files";
import {
  filterModels,
  MODEL_CATEGORY_MAX,
  MODEL_CATEGORY_SUGGESTIONS,
  MODEL_DESCRIPTION_MAX,
  MODEL_TITLE_MAX,
  modelCategories,
  modelErrorMessage,
  modelShareText,
  validateModelDraft,
  type DesignModel,
  type ModelDraftErrors,
} from "@/domain/models/designModels";
import { deleteModel, listModels, ModelsError, saveModel } from "@/infrastructure/models/modelsRemote";
import { fetchPhotoBlob, listFiles } from "@/infrastructure/files/filesClient";
import { PhotoGallery } from "@/features/files/PhotoGallery";
import { useAtelierIdentity } from "@/features/orders/useAtelierIdentity";

function canWriteModels(): boolean {
  const role = peekActiveSession()?.role ?? null;
  return role !== null && (TENANT_ROLE_CODES as readonly string[]).includes(role) && can(role as TenantRoleCode, "orders.write");
}

function errorCode(e: unknown): string | null {
  return e instanceof ModelsError ? e.code : null;
}

/** Galerie des modèles de l'atelier, avec photos privées, à montrer aux clients. */
export function ModelsView(): React.ReactElement {
  const session = peekActiveSession();
  const online = session?.mode === "SUPABASE";
  const canWrite = canWriteModels();
  const [models, setModels] = useState<DesignModel[] | null>(null);
  const [covers, setCovers] = useState<Map<string, FileView>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<DesignModel | "new" | null>(null);
  const [viewing, setViewing] = useState<DesignModel | null>(null);
  const [justCreated, setJustCreated] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const list = await listModels();
      setModels(list);
      try {
        const photos = await listFiles("MODEL", "all");
        const first = new Map<string, FileView>();
        for (const p of photos) if (!first.has(p.entityId)) first.set(p.entityId, p);
        setCovers(first);
      } catch {
        // vignettes indisponibles : la liste reste utilisable
      }
    } catch (e) {
      setError(modelErrorMessage(errorCode(e)));
    }
  }, []);

  useEffect(() => {
    if (!online) return;
    void (async () => {
      await load();
    })();
  }, [online, load]);

  const categories = useMemo(() => modelCategories(models ?? []), [models]);
  const shown = useMemo(() => filterModels(models ?? [], category, search), [models, category, search]);

  return (
    <div className="@container mx-auto w-full max-w-6xl px-4 py-6 sm:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title text-4xl text-ink sm:text-5xl">Mes modèles</h1>
          <p className="mt-1 text-sm text-ink-soft">Vos créations en photos, à montrer et à envoyer à vos clients.</p>
        </div>
        {online && canWrite ? (
          <Button onClick={() => setEditing("new")}>
            <Plus className="size-4" aria-hidden="true" />
            Nouveau modèle
          </Button>
        ) : null}
      </header>

      {!online ? (
        <div className="mt-6">
          <StateView variant="empty" title="Connexion nécessaire" description="Les modèles et leurs photos sont enregistrés sur le serveur : connectez-vous en ligne pour les voir." />
        </div>
      ) : (
        <>
          <div className="mt-6 flex flex-col gap-3">
            <div className="relative w-full sm:w-96">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-flamme-500" aria-hidden="true" />
              <input
                type="search"
                aria-label="Rechercher un modèle"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un modèle…"
                className="h-12 w-full rounded-full border-2 border-outline bg-surface/90 pl-11 pr-4 text-sm font-medium text-ink shadow-soft placeholder:text-ink-faint focus:border-flamme-500 focus:outline-none"
              />
            </div>
            {categories.length > 0 ? (
              <ul className="flex flex-wrap gap-2" aria-label="Catégories">
                {[null, ...categories].map((c) => (
                  <li key={c ?? "*"}>
                    <button
                      type="button"
                      onClick={() => setCategory(c)}
                      aria-pressed={category === c}
                      className={cx(
                        "inline-flex h-9 items-center rounded-full border px-4 text-sm font-semibold transition-all hover:-translate-y-0.5 pointer-coarse:h-11",
                        category === c ? "border-transparent bg-flamme-gradient text-white shadow-soft" : "border-outline bg-surface text-ink-soft hover:border-flamme-300",
                      )}
                    >
                      {c ?? "Tous"}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <main className="mt-6">
            {error ? (
              <StateView variant="error" title="Modèles indisponibles" description={error} action={<Button onClick={() => void load()}>Réessayer</Button>} />
            ) : models === null ? (
              <ul className="grid grid-cols-2 gap-3 @2xl:grid-cols-3 @4xl:grid-cols-4" aria-label="Chargement">
                {Array.from({ length: 8 }, (_, i) => (
                  <li key={i} className="skeleton-shimmer aspect-[3/4] rounded-xl" />
                ))}
              </ul>
            ) : models.length === 0 ? (
              <StateView
                variant="empty"
                title="Aucun modèle pour l'instant"
                description="Ajoutez vos créations (grand boubou, robe, ensemble…) avec leurs photos pour les montrer à vos clients."
                action={canWrite ? <Button onClick={() => setEditing("new")}>Ajouter un modèle</Button> : undefined}
              />
            ) : shown.length === 0 ? (
              <StateView variant="empty" title="Aucun modèle trouvé" description="Essayez une autre catégorie ou un autre mot." />
            ) : (
              <ul className="stagger grid grid-cols-2 gap-3 @2xl:grid-cols-3 @4xl:grid-cols-4">
                {shown.map((m) => {
                  const cover = covers.get(m.id);
                  return (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => setViewing(m)}
                        className="group flex w-full flex-col overflow-hidden rounded-xl border border-outline bg-surface text-left shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-lift"
                      >
                        <span className="relative grid aspect-[3/4] w-full place-items-center overflow-hidden bg-surface-2">
                          {cover ? (
                            // eslint-disable-next-line @next/next/no-img-element -- lien signé privé
                            <img src={cover.url} alt={m.title} loading="lazy" className="size-full object-cover transition-transform duration-500 group-hover:scale-105" />
                          ) : (
                            <Shirt className="size-10 text-ink-faint" aria-hidden="true" />
                          )}
                          {m.category ? (
                            <span className="absolute left-2 top-2">
                              <Badge tone="primary">{m.category}</Badge>
                            </span>
                          ) : null}
                        </span>
                        <span className="flex flex-col gap-0.5 p-3">
                          <span className="line-clamp-2 font-semibold text-ink">{m.title}</span>
                          {m.price !== null ? <span className="text-sm font-bold tabular text-menthe-700">{formatMoney(m.price)}</span> : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </main>
        </>
      )}

      {editing ? (
        <ModelFormDialog
          model={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async (saved, created) => {
            setEditing(null);
            await load();
            setJustCreated(created);
            setViewing(saved);
          }}
        />
      ) : null}

      {viewing ? (
        <ModelDialog
          model={viewing}
          canWrite={canWrite}
          justCreated={justCreated}
          onClose={() => {
            setViewing(null);
            setJustCreated(false);
            void load();
          }}
          onEdit={() => {
            setEditing(viewing);
            setViewing(null);
          }}
          onDeleted={async () => {
            setViewing(null);
            await load();
          }}
        />
      ) : null}
    </div>
  );
}

function ModelFormDialog({
  model,
  onClose,
  onSaved,
}: {
  model: DesignModel | null;
  onClose: () => void;
  onSaved: (model: DesignModel, created: boolean) => Promise<void>;
}) {
  const [title, setTitle] = useState(model?.title ?? "");
  const [category, setCategory] = useState(model?.category ?? "");
  const [priceInput, setPriceInput] = useState(model?.price != null ? String(model.price) : "");
  const [description, setDescription] = useState(model?.description ?? "");
  const [errors, setErrors] = useState<ModelDraftErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const result = validateModelDraft({ title, category, description, priceInput });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setFailure(null);
    setBusy(true);
    try {
      const saved = await saveModel(model?.id ?? null, result.value);
      await onSaved(saved, model === null);
    } catch (err) {
      setFailure(modelErrorMessage(errorCode(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={model ? "Modifier le modèle" : "Nouveau modèle"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form="model-form" disabled={busy}>
            {busy ? "Enregistrement…" : model ? "Enregistrer" : "Créer et ajouter des photos"}
          </Button>
        </>
      }
    >
      <form id="model-form" onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
        <Field label="Nom du modèle" htmlFor="model-title" error={errors.title}>
          <Input id="model-title" value={title} maxLength={MODEL_TITLE_MAX} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Grand boubou brodé 3 pièces" />
        </Field>
        <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2">
          <Field label="Catégorie" htmlFor="model-category" error={errors.category}>
            <Input id="model-category" list="model-categories" value={category} maxLength={MODEL_CATEGORY_MAX} onChange={(e) => setCategory(e.target.value)} placeholder="Ex. Grand boubou" />
            <datalist id="model-categories">
              {MODEL_CATEGORY_SUGGESTIONS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label={`Prix indicatif (${currencySymbol()})`} htmlFor="model-price" error={errors.price}>
            <Input id="model-price" inputMode="numeric" value={priceInput} onChange={(e) => setPriceInput(e.target.value)} placeholder="Facultatif" />
          </Field>
        </div>
        <Field label="Description" htmlFor="model-description" error={errors.description}>
          <Textarea id="model-description" rows={4} maxLength={MODEL_DESCRIPTION_MAX} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Tissu conseillé, broderie, délai, métrage…" />
        </Field>
        {failure ? <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{failure}</p> : null}
      </form>
    </Dialog>
  );
}

function ModelDialog({
  model,
  canWrite,
  justCreated,
  onClose,
  onEdit,
  onDeleted,
}: {
  model: DesignModel;
  canWrite: boolean;
  justCreated: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDeleted: () => Promise<void>;
}) {
  const { identity } = useAtelierIdentity();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function share() {
    setBusy(true);
    setMessage(null);
    try {
      const photos = (await listFiles("MODEL", model.id)).slice(0, 4);
      if (photos.length === 0) {
        setMessage("Ajoutez d'abord une photo à ce modèle.");
        return;
      }
      const files = await Promise.all(
        photos.map(async (p, i) => {
          const blob = await fetchPhotoBlob(p.id);
          const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
          return new File([blob], `modele-${i + 1}.${ext}`, { type: blob.type });
        }),
      );
      const text = modelShareText(model, (n) => formatMoney(n), identity?.name);
      if (typeof navigator.canShare === "function" && navigator.canShare({ files })) {
        await navigator.share({ files, text, title: model.title });
      } else {
        // Ordinateur sans partage : on télécharge les photos.
        for (const f of files) {
          const url = URL.createObjectURL(f);
          const a = document.createElement("a");
          a.href = url;
          a.download = f.name;
          document.body.append(a);
          a.click();
          a.remove();
          window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
        setMessage("Partage non disponible sur cet appareil : les photos ont été téléchargées.");
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setMessage("Le partage n'a pas abouti. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await deleteModel(model.id);
      await onDeleted();
    } catch (e) {
      setMessage(modelErrorMessage(errorCode(e)));
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={model.title}
      footer={
        confirming ? (
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Garder
            </Button>
            <Button variant="danger" onClick={() => void remove()} disabled={busy}>
              <Trash2 className="size-4" aria-hidden="true" />
              Supprimer définitivement
            </Button>
          </>
        ) : (
          <>
            {canWrite ? (
              <>
                <Button variant="ghost" onClick={() => setConfirming(true)}>
                  <Trash2 className="size-4" aria-hidden="true" />
                  Supprimer
                </Button>
                <Button variant="outline" onClick={onEdit}>
                  <Pencil className="size-4" aria-hidden="true" />
                  Modifier
                </Button>
              </>
            ) : null}
            <button
              type="button"
              onClick={() => void share()}
              disabled={busy}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-azur-600 px-5 text-sm font-semibold text-white shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lift disabled:opacity-60"
            >
              <Share2 className="size-4" aria-hidden="true" />
              {busy ? "Préparation…" : "Envoyer au client"}
            </button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {justCreated ? (
          <p role="status" className="flex items-center gap-2 rounded-lg border border-menthe-300 bg-menthe-50 px-3 py-2 text-sm font-semibold text-menthe-700">
            <ImagePlus className="size-4 shrink-0" aria-hidden="true" />
            Modèle créé : ajoutez maintenant ses photos.
          </p>
        ) : null}
        {confirming ? (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            Supprimer ce modèle et ses photos ? Les commandes déjà faites ne changent pas.
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          {model.category ? <Badge tone="primary">{model.category}</Badge> : null}
          {model.price !== null ? <span className="font-bold tabular text-menthe-700">À partir de {formatMoney(model.price)}</span> : null}
        </div>
        {model.description ? <p className="whitespace-pre-line text-sm text-ink">{model.description}</p> : null}
        <PhotoGallery category="MODEL" entityId={model.id} title="Photos du modèle" />
        {message ? <p role="status" className="rounded-md bg-surface-2 px-3 py-2 text-sm text-ink-soft">{message}</p> : null}
      </div>
    </Dialog>
  );
}
