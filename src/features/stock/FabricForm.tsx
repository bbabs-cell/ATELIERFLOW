"use client";

import { useState } from "react";
import { Shirt } from "lucide-react";
import { Button, Field, Input } from "@/ui";

export interface FabricFormValues {
  name: string;
  color: string;
  supplier: string;
  unitPriceInput: string;
  initialMeters: string;
}

export interface FabricFormProps {
  busy?: boolean;
  errors?: Record<string, string> | null;
  onSubmit: (values: FabricFormValues) => Promise<void>;
  onCancel: () => void;
}

export function FabricForm({
  busy,
  errors,
  onSubmit,
  onCancel,
}: FabricFormProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("");
  const [supplier, setSupplier] = useState("");
  const [unitPriceInput, setUnitPriceInput] = useState("");
  const [initialMeters, setInitialMeters] = useState("");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="flex size-9 items-center justify-center rounded-full bg-champagne-400 text-chocolat-950">
          <Shirt className="size-4" aria-hidden="true" />
        </span>
        <h2 className="font-display text-2xl text-ink">Nouveau tissu</h2>
      </div>

      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          void onSubmit({ name, color, supplier, unitPriceInput, initialMeters });
        }}
        noValidate
      >
        <div className="grid gap-4 min-[480px]:grid-cols-2">
          <Field label="Nom" required htmlFor="fabric-name" error={errors?.name}>
            <Input
              id="fabric-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex : Wax bleu royal"
              invalid={Boolean(errors?.name)}
            />
          </Field>
          <Field label="Couleur" htmlFor="fabric-color">
            <Input
              id="fabric-color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="Ex : Bleu cobalt"
            />
          </Field>
        </div>

        <Field label="Fournisseur" htmlFor="fabric-supplier">
          <Input
            id="fabric-supplier"
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            placeholder="Ex : Maison du tissu"
          />
        </Field>

        <div className="grid gap-4 min-[480px]:grid-cols-2">
          <Field
            label="Prix au mètre (F CFA)"
            htmlFor="fabric-price"
            error={errors?.unitPrice}
            hint="Optionnel"
          >
            <Input
              id="fabric-price"
              inputMode="numeric"
              value={unitPriceInput}
              onChange={(e) => setUnitPriceInput(e.target.value)}
              placeholder="Ex : 15 000"
              invalid={Boolean(errors?.unitPrice)}
            />
          </Field>
          <Field
            label="Stock initial (m)"
            htmlFor="fabric-initial"
            error={errors?.initialMeters}
            hint="Optionnel — écrit un mouvement d'ouverture"
          >
            <Input
              id="fabric-initial"
              inputMode="decimal"
              value={initialMeters}
              onChange={(e) => setInitialMeters(e.target.value)}
              placeholder="10"
              invalid={Boolean(errors?.initialMeters)}
            />
          </Field>
        </div>

        <div className="flex justify-end gap-2 border-t border-anthracite-100 pt-4">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            Annuler
          </Button>
          <Button type="submit" loading={busy}>
            Ajouter le tissu
          </Button>
        </div>
      </form>
    </div>
  );
}