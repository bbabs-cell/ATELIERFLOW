"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Archive, Pencil, Plus, UserRound } from "lucide-react";
import { Button, Dialog, Drawer } from "@/ui";
import type { ContactErrors, Customer } from "@/domain/clients/customer";
import type { CustomerContactInput } from "@/domain/clients/customer";
import { getClientsFacade } from "./facade";
import { CustomerForm } from "./CustomerForm";
import { ClientsList } from "./ClientsList";
import { MeasurementsPanel } from "./MeasurementsPanel";
import { ProfileForm } from "./ProfileForm";

export function ClientsView(): React.ReactElement {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Customer | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [formErrors, setFormErrors] = useState<ContactErrors | null>(null);
  const [saving, setSaving] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const searchTimer = useRef<number | null>(null);

  const load = useCallback(async (query: string) => {
    setError(null);
    try {
      const list = await getClientsFacade().clients.listCustomers({
        search: query,
        includeArchive: false,
      });
      setCustomers(list);
      if (searchTimer.current !== null) {
        window.clearTimeout(searchTimer.current);
        searchTimer.current = null;
      }
    } catch {
      setError("Impossible de charger la liste des clients.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await load("");
      } catch {
        if (!cancelled) setError("Impossible de charger la liste des clients.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    if (searchTimer.current !== null) {
      window.clearTimeout(searchTimer.current);
    }
    searchTimer.current = window.setTimeout(() => {
      void load(search);
    }, 250);
    return () => {
      if (searchTimer.current !== null) window.clearTimeout(searchTimer.current);
    };
  }, [search, load]);

  function openCreate() {
    setEditing(null);
    setFormErrors(null);
    setFormOpen(true);
  }

  function openEdit() {
    if (!selected) return;
    setEditing(selected);
    setFormErrors(null);
    setFormOpen(true);
  }

  async function submitForm(values: CustomerContactInput) {
    setSaving(true);
    setFormErrors(null);
    try {
      const facade = getClientsFacade();
      const result = editing
        ? await facade.clients.updateCustomer(editing.id, values)
        : await facade.clients.createCustomer(values);
      if (!result.ok) {
        setFormErrors(result.errors);
        return;
      }
      setFormOpen(false);
      setFormErrors(null);
      await load(search);
      if (editing) {
        setSelected(
          (await facade.clients.getCustomer(editing.id)) ?? selected,
        );
      }
    } finally {
      setSaving(false);
    }
  }

  async function archive() {
    if (!selected) return;
    const facade = getClientsFacade();
    await facade.clients.archiveCustomer(selected.id);
    setSelected((await facade.clients.getCustomer(selected.id)) ?? null);
    await load(search);
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-ink sm:text-4xl">Clients</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Carnet de l&apos;atelier — créations, fiches et mesures.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" aria-hidden="true" />
          Nouveau client
        </Button>
      </header>

      <main className="mt-8">
        <ClientsList
          customers={customers}
          loading={loading}
          error={error}
          search={search}
          onSearch={setSearch}
          onSelect={setSelected}
          onRetry={() => load(search).catch(() => undefined)}
        />
      </main>

      <Drawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        side="right"
        title="Fiche client"
      >
        {selected ? (
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-champagne-400 text-chocolat-950">
                <UserRound className="size-6" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="truncate font-display text-xl text-ink">
                  {selected.full_name}
                </p>
                <p className="text-sm text-ink-soft">
                  {[selected.phone, selected.email].filter(Boolean).join(" · ") ||
                    "Aucun contact"}
                </p>
              </div>
            </div>

            {selected.notes ? (
              <p className="rounded-lg bg-ivoire-100 px-3 py-2 text-sm text-ink-soft">
                {selected.notes}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={openEdit}>
                <Pencil className="size-4" aria-hidden="true" />
                Modifier
              </Button>
              {selected.status !== "ARCHIVED" ? (
                <Button variant="ghost" size="sm" onClick={() => void archive()}>
                  <Archive className="size-4" aria-hidden="true" />
                  Archiver
                </Button>
              ) : null}
            </div>

            <MeasurementsPanel
              customerId={selected.id}
              onNewProfile={() => setProfileOpen(true)}
            />
          </div>
        ) : null}
      </Drawer>

      <Dialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? "Modifier le client" : "Nouveau client"}
        size="md"
      >
        <CustomerForm
          title={editing ? "Modifier le client" : "Nouveau client"}
          initial={
            editing
              ? {
                  full_name: editing.full_name,
                  phone: editing.phone ?? "",
                  whatsapp: editing.whatsapp ?? "",
                  email: editing.email ?? "",
                  address: editing.address ?? "",
                  notes: editing.notes ?? "",
                }
              : undefined
          }
          errors={formErrors}
          busy={saving}
          onSubmit={submitForm}
          onCancel={() => setFormOpen(false)}
        />
      </Dialog>

      <Dialog
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        title="Nouveau profil de mesures"
        size="md"
      >
        {selected ? (
          <ProfileForm
            onDone={() => setProfileOpen(false)}
            onCancel={() => setProfileOpen(false)}
          />
        ) : null}
      </Dialog>
    </div>
  );
}