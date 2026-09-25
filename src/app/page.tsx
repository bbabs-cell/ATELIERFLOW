"use client";

import { useState } from "react";
import {
  Users,
  Package,
  Scissors,
  CalendarIcon,
  Wallet,
  Shirt,
  ClipboardList,
  AlertTriangle,
  Sun,
  Flag,
  Check,
  Home,
} from "lucide-react";
import { cx } from "@/lib/cx";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Calendar,
  Dialog,
  Drawer,
  Dropdown,
  Field,
  Input,
  Kanban,
  MiniChart,
  Select,
  Skeleton,
  StateView,
  Switch,
  Table,
  Tabs,
  TD,
  Textarea,
  TH,
  Timeline,
  ToastProvider,
  TRow,
  THead,
  useToast,
} from "@/ui";

const paletteSwatches: Array<{ name: string; values: Array<[string, string, string]> }> = [
  { name: "chocolat", values: [
    ["50", "#F7F0EA", "text-chocolat-950"], ["100", "#EFE2D7", "text-chocolat-950"],
    ["200", "#DFC4B2", "text-chocolat-950"], ["300", "#CFA68D", "text-chocolat-950"],
    ["400", "#B98363", "text-chocolat-950"], ["500", "#A0654A", "text-white"],
    ["600", "#7E4E39", "text-white"], ["700", "#5D3A2C", "text-white"],
    ["800", "#4A2F24", "text-white"], ["900", "#3E2723", "text-ivoire-100"], ["950", "#2A1B18", "text-ivoire-100"],
  ] },
  { name: "beige", values: [
    ["50", "#FAF5EC", "text-chocolat-950"], ["100", "#F1E8D9", "text-chocolat-950"],
    ["200", "#E6D6BD", "text-chocolat-950"], ["300", "#D9C4A5", "text-chocolat-950"],
    ["400", "#C8AC84", "text-chocolat-950"], ["500", "#B7956A", "text-chocolat-950"],
  ] },
  { name: "ivoire", values: [
    ["50", "#FDFBF6", "text-chocolat-950"], ["100", "#F8F4EA", "text-chocolat-950"],
    ["200", "#F2ECDB", "text-chocolat-950"], ["300", "#E8DFC8", "text-chocolat-950"],
  ] },
  { name: "champagne", values: [
    ["100", "#EFE4CC", "text-chocolat-950"], ["200", "#E0CDA8", "text-chocolat-950"],
    ["300", "#D2B98A", "text-chocolat-950"], ["400", "#C6A664", "text-chocolat-950"],
    ["500", "#A9864A", "text-white"], ["600", "#8A6C37", "text-white"],
  ] },
  { name: "anthracite", values: [
    ["50", "#F4F4F5", "text-chocolat-950"], ["100", "#E6E6E9", "text-chocolat-950"],
    ["200", "#C9C9CE", "text-chocolat-950"], ["300", "#A9A9AF", "text-chocolat-950"],
    ["400", "#808086", "text-white"], ["500", "#6B6B72", "text-white"],
    ["600", "#4E4E55", "text-white"], ["700", "#46464B", "text-white"],
    ["800", "#38383D", "text-white"], ["900", "#2B2B2E", "text-white"], ["950", "#1B1B1D", "text-white"],
  ] },
  { name: "sémantique", values: [
    ["success", "#2E7D32", "text-white"], ["success-soft", "#E6F2E6", "text-chocolat-950"],
    ["warning", "#E65100", "text-white"], ["warning-soft", "#FBE9DE", "text-chocolat-950"],
    ["danger", "#C62828", "text-white"], ["danger-soft", "#FAE6E6", "text-chocolat-950"],
    ["info", "#2F5D9E", "text-white"], ["info-soft", "#E4ECF6", "text-chocolat-950"],
  ] },
];

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="mb-3 border-b border-outline pb-2 font-display text-2xl text-ink">{title}</h2>
      <Card className="mb-10">{children}</Card>
    </section>
  );
}

function Demos() {
  const [tab, setTab] = useState("infos");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { toast } = useToast();

  const tabs = [
    { value: "infos", label: "Infos" },
    { value: "mesures", label: "Mesures" },
    { value: "paiements", label: "Paiements" },
    { value: "historique", label: "Historique" },
  ];

  const [orderStatus, setOrderStatus] = useState("SEWING");
  const [saleMode, setSaleMode] = useState(true);

  return (
    <>
      <Section id="palette" title="Palette">
        <div className="flex flex-col gap-6">
          {paletteSwatches.map((group) => (
            <div key={group.name}>
              <p className="mb-2 text-sm font-medium capitalize text-ink">{group.name}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-[repeat(11,minmax(0,1fr))]">
                {group.values.map(([shade, hex, text]) => (
                  <div key={shade} className={cx("flex h-16 flex-col justify-between rounded-md p-2", text)} style={{ backgroundColor: hex }}>
                    <span className="text-[0.65rem] font-medium opacity-80">{shade}</span>
                    <span className="text-[0.65rem] tabular-nums opacity-80">{hex}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section id="typographie" title="Typographie">
        <div className="flex flex-col gap-3">
          <p className="font-display text-5xl text-ink">Madeleine Atelier</p>
          <p className="font-display text-4xl text-ink">Aujourd&apos;hui, 12 commandes</p>
          <p className="font-display text-3xl text-ink">Mesures d&apos;essayage — jeudi</p>
          <p className="font-display text-2xl text-ink">Robe de mariée · Solde 15 000 F</p>
          <p className="font-display text-xl text-ink">Titre de section (Cormorant, 700)</p>
          <p className="font-display text-lg italic text-ink">Chapeau italique — Atelier de couture</p>
          <p className="text-lg text-ink">Corps de texte (Inter) : gestion quotidienne de l&apos;atelier.</p>
          <p className="text-base text-ink">14px — labels, boutons, tableaux de bord.</p>
          <p className="text-sm text-ink-soft">13px — aide, secondaire.</p>
          <p className="text-xs text-ink-faint">12px — légendes, timestamps.</p>
          <p className="text-champagne-500 font-display text-2xl font-bold">Chiffres 24 500 F — accent champagne</p>
        </div>
      </Section>

      <Section id="boutons" title="Boutons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button size="sm">Petit</Button>
          <Button size="md">Moyen</Button>
          <Button size="lg">Grand</Button>
          <Button loading>Enregistrement…</Button>
          <Button disabled>Désactivé</Button>
        </div>
      </Section>

      <Section id="formulaire" title="Formulaires">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          <Field label="Nom complet" required htmlFor="f-name">
            <Input id="f-name" placeholder="Aminata Koné" />
          </Field>
          <Field label="Téléphone" hint="Format +225 07 __ __ __ __" htmlFor="f-tel">
            <Input id="f-tel" type="tel" inputMode="tel" placeholder="+225" />
          </Field>
          <Field label="Statut" htmlFor="f-statut">
            <Select id="f-statut" defaultValue="registered">
              <option value="registered">Enregistrée</option>
              <option value="sewing">En couture</option>
              <option value="delivered">Livrée</option>
            </Select>
          </Field>
          <Field label="Notes" htmlFor="f-notes">
            <Textarea id="f-notes" placeholder="Détails, préférences, tissu…" />
          </Field>
          <Field label="Téléphone (erreur)" error="Numéro invalide" htmlFor="f-tel-err">
            <Input id="f-tel-err" invalid defaultValue="abcd" />
          </Field>
          <Field label="Mode vente">
            <div className="flex items-center gap-3">
              <Switch checked={saleMode} onChange={(e) => setSaleMode(e.target.checked)} aria-label="Mode vente actif" />
              <span className="text-sm text-ink-soft">{saleMode ? "Actif" : "Inactif"}</span>
            </div>
          </Field>
        </div>
      </Section>

      <Section id="badges" title="Badges">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Neutre</Badge>
          <Badge tone="primary">Primary</Badge>
          <Badge tone="accent">Accent · Prix</Badge>
          <Badge tone="success">Livrée</Badge>
          <Badge tone="warning">En retard</Badge>
          <Badge tone="danger">CANCELED</Badge>
          <Badge tone="info">Info</Badge>
          <Badge tone="primary" dot>En couture</Badge>
        </div>
      </Section>

      <Section id="cartes" title="Cartes">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader title="Commandes du jour" description="12 en cours · 2 retards" action={<Badge tone="warning" dot>2</Badge>} />
            <p className="text-sm text-ink-soft">Les colonnes et métriques vivent dans des Cards.</p>
          </Card>
          <Card className="bg-chocolat-900 text-ivoire-100">
            <CardHeader title="Chiffre du jour" description="Espèces + Orange Money" />
            <p className="font-display text-3xl text-champagne-400">48 500 F</p>
          </Card>
          <Card padded={false} className="overflow-hidden">
            <div className="border-b border-outline bg-surface-2 px-5 py-3 text-sm font-medium text-ink">Sans padding</div>
            <div className="p-5 text-sm text-ink-soft">Contenu de la carte.</div>
          </Card>
        </div>
      </Section>

      <Section id="tableau" title="Tableau">
        <Table>
          <THead>
            <TRow>
              <TH>Client</TH>
              <TH>Commande</TH>
              <TH>Statut</TH>
              <TH className="hidden sm:table-cell">Prévu</TH>
              <TH className="text-right">Total</TH>
            </TRow>
          </THead>
          <tbody>
            <TRow>
              <TD className="font-medium text-ink">Awa Diarra</TD>
              <TD className="tabular-nums text-ink-soft">ORD-2026-000142</TD>
              <TD><Badge tone="accent">SEWING</Badge></TD>
              <TD className="hidden sm:table-cell text-ink-soft">27 sept.</TD>
              <TD className="text-right tabular-nums font-medium text-ink">35 000 F</TD>
            </TRow>
            <TRow>
              <TD className="font-medium text-ink">Moussa Traoré</TD>
              <TD className="tabular-nums text-ink-soft">ORD-2026-000143</TD>
              <TD><Badge tone="warning">EN RETARD</Badge></TD>
              <TD className="hidden sm:table-cell text-ink-soft">23 sept.</TD>
              <TD className="text-right tabular-nums font-medium text-ink">18 750 F</TD>
            </TRow>
            <TRow>
              <TD className="font-medium text-ink">Fatou Bamba</TD>
              <TD className="tabular-nums text-ink-soft">ORD-2026-000139</TD>
              <TD><Badge tone="success">LISTED</Badge></TD>
              <TD className="hidden sm:table-cell text-ink-soft">25 sept.</TD>
              <TD className="text-right tabular-nums font-medium text-ink">64 000 F</TD>
            </TRow>
          </tbody>
        </Table>
      </Section>

      <Section id="onglets" title="Onglets">
        <Tabs items={tabs} value={tab} onChange={setTab} className="mb-3" />
        <div className="rounded-md border border-dashed border-outline p-4 text-sm text-ink-soft">
          Panneau actif : <span className="font-medium text-ink">{tab}</span>. Les onglets défilent sur mobile.
        </div>
      </Section>

      <Section id="menu" title="Menu déroulant">
        <div className="flex items-center gap-6">
          <Dropdown
            ariaLabel="Actions sur la commande"
            trigger={<Button variant="outline">Actions</Button>}
            items={[
              { label: "Marquer prête", value: "ready", onSelect: () => setOrderStatus("READY") },
              { label: "Modifier les mesures", value: "mesures" },
              { label: "Annuler la commande", value: "cancel", danger: true },
            ]}
          />
          <span className="text-sm text-ink-soft">
            Statut démo : <span className="font-medium text-ink">{orderStatus}</span>
          </span>
        </div>
      </Section>

      <Section id="modale" title="Dialog (modale)">
        <Button onClick={() => setDialogOpen(true)}>Ouvrir la modale</Button>
        <Dialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          title="Confirmer le paiement"
          footer={
            <>
              <Button variant="ghost" onClick={() => setDialogOpen(false)}>Annuler</Button>
              <Button onClick={() => { setDialogOpen(false); toast({ tone: "success", title: "Paiement enregistré", description: "Solde recalculé : reste 15 000 F" }); }}>
                Confirmer
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex justify-between"><span className="text-ink-soft">Commande</span><span className="tabular-nums font-medium text-ink">ORD-2026-000142</span></div>
            <div className="flex justify-between"><span className="text-ink-soft">Montant</span><span className="tabular-nums font-medium text-champagne-500">20 000 F</span></div>
            <div className="flex justify-between"><span className="text-ink-soft">Moyen</span><span className="font-medium text-ink">Orange Money</span></div>
          </div>
        </Dialog>
      </Section>

      <Section id="tiroir" title="Drawer (panneau latéral)">
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => setDrawerOpen(true)}>Ouvrir le tiroir</Button>
        </div>
        <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Détails de la commande">
          <div className="flex flex-col gap-3 text-sm">
            <p className="text-ink-soft">Photos, mesures et historique client s&apos;ouvrent ici — maintenu à 100 % sur mobile.</p>
            <Timeline
              items={[
                { title: "Commande enregistrée", date: "12 sept.", status: "REGISTERED", tone: "primary", icon: <ClipboardList className="size-4" /> },
                { title: "Tissu reçu", date: "14 sept.", status: "FABRIC_RECEIVED", tone: "info", icon: <Shirt className="size-4" /> },
                { title: "En couture", date: "Depuis le 18 sept.", status: "SEWING", tone: "accent", icon: <Scissors className="size-4" /> },
              ]}
            />
          </div>
        </Drawer>
      </Section>

      <Section id="toasts" title="Toasts">
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => toast({ tone: "success", title: "Sauvegardé", description: "La fiche client a été mise à jour." })}>Succès</Button>
          <Button variant="secondary" onClick={() => toast({ tone: "error", title: "Échec de synchronisation", description: "Réessai dans 30 s." })}>Erreur</Button>
          <Button variant="secondary" onClick={() => toast({ tone: "warning", title: "Stock faible", description: "Tissu « wax bleu » : 1.2 m restant." })}>Alerte</Button>
          <Button variant="secondary" onClick={() => toast({ tone: "info", title: "Mise à jour", description: "Une nouvelle version est prête." })}>Info</Button>
        </div>
      </Section>

      <Section id="timeline" title="Timeline (historique)">
        <Timeline
          items={[
            { title: "Commande enregistrée", date: "12 sept. 09:14", author: "Awa", status: "REGISTERED", tone: "primary", icon: <ClipboardList className="size-4" /> },
            { title: "Tissu reçu", date: "14 sept. 17:02", author: "Sita", status: "FABRIC_RECEIVED", tone: "info", icon: <Shirt className="size-4" /> },
            { title: "En préparation", date: "16 sept.", author: "Mamadou", status: "PREPARATION", tone: "info", icon: <Sun className="size-4" /> },
            { title: "En couture", date: "Depuis le 18 sept.", author: "Mamadou", status: "SEWING", tone: "accent", icon: <Scissors className="size-4" /> },
          ]}
        />
      </Section>

      <Section id="calendrier" title="Calendrier">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <Card>
            <Calendar
              events={[
                { id: "1", date: new Date().toISOString().slice(0, 10), label: "Essayage Awa", tone: "accent" },
                { id: "2", date: new Date().toISOString().slice(0, 10), label: "Mesures client", tone: "primary" },
                { id: "3", date: "2026-09-26", label: "Livraison Moussa", tone: "success" },
                { id: "4", date: "2026-09-27", label: "Paiement Fatou", tone: "danger" },
              ]}
            />
          </Card>
          <div className="flex flex-col justify-center gap-2 text-sm text-ink-soft">
            <p className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-accent" /> Essayage / retouche</p>
            <p className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-chocolat-800" /> Mesures</p>
            <p className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-success" /> Livraison</p>
            <p className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-danger" /> Paiement attendu</p>
          </div>
        </div>
      </Section>

      <Section id="kanban" title="Kanban atelier">
        <Kanban
          onCardClick={(id) => toast({ tone: "info", title: "Ouvrir la commande", description: id })}
          columns={[
            {
              id: "prep", title: "Préparation", count: 2, accent: "info",
              cards: [
                { id: "ORD-1", title: "Robe de cérémonie", meta: "Awa · à découper", footer: <><Badge tone="info" dot>PREP</Badge><span className="text-xs tabular-nums text-ink-faint">25 sept.</span></> },
                { id: "ORD-2", title: "Chemise homme", meta: "Moussa", footer: <Badge tone="info" dot>PREP</Badge> },
              ],
            },
            {
              id: "sewing", title: "En couture", count: 4, accent: "accent",
              cards: [
                { id: "ORD-3", title: "Ensemble wax", meta: "Fatou · finition", footer: <><Badge tone="accent" dot>SEWING</Badge><span className="text-xs text-ink-faint">Mamadou</span></> },
                { id: "ORD-4", title: "Jupe plissée", meta: "Salimata", footer: <Badge tone="accent" dot>SEWING</Badge> },
              ],
            },
            {
              id: "ready", title: "Prêtes", count: 1, accent: "success",
              cards: [
                { id: "ORD-5", title: "Pagne reconstitué", meta: "Awa", footer: <><Badge tone="success">PRÊTE</Badge><span className="text-xs text-ink-faint">À retirer</span></> },
              ],
            },
          ]}
        />
      </Section>

      <Section id="graphiques" title="Graphiques">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-medium text-ink">Chiffre — 7 derniers jours</p>
            <Card>
              <MiniChart
                data={[12, 20, 8, 26, 18, 34, 22]}
                variant="bars"
                formatTooltip={(v) => `${v} 000 F`}
              />
            </Card>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-ink">Commandes — tendance</p>
            <Card>
              <MiniChart
                data={[4, 6, 5, 9, 7, 11, 10]}
                variant="spark"
                accent="var(--color-chocolat-500)"
                formatTooltip={(v) => `${v} commandes`}
              />
            </Card>
          </div>
        </div>
      </Section>

      <Section id="etats" title="États de données">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StateView variant="loading" />
          <StateView variant="empty" title="Aucune commande" description="Créez votre première commande pour démarrer." action={<Button size="sm">Nouvelle commande</Button>} />
          <StateView variant="error" title="Impossible de charger" description="Vérifiez votre connexion puis réessayez." action={<Button size="sm" variant="outline"><AlertTriangle className="size-4" /> Réessayer</Button>} />
          <StateView variant="success" title="Paiement confirmé" description="Reçu REC-2026-000123 émis." />
          <StateView variant="offline" title="Hors ligne" description="La saisie continue localement. Synchronisation en attente." />
          <StateView variant="sync" title="Synchronisation" description="12 opérations en attente…" />
        </div>
      </Section>

      <Section id="squelette" title="Squelettes (chargements)">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-3.5 w-1/3" />
              <Skeleton className="h-3.5 w-1/2" />
            </div>
          </div>
          <Skeleton className="h-24 w-full" />
        </div>
      </Section>

      <Section id="navigation" title="Navigation">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Tableau de bord", icon: Home, active: true },
            { label: "Clients", icon: Users },
            { label: "Commandes", icon: Package },
            { label: "Atelier", icon: Scissors },
            { label: "Paiements", icon: Wallet },
            { label: "Rendez-vous", icon: CalendarIcon },
            { label: "Stock · Tissus", icon: Shirt },
            { label: "Équipe", icon: Users },
          ].map(({ label, icon: Icon, active }) => (
            <button
              key={label}
              type="button"
              className={cx(
                "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
                active ? "bg-chocolat-900 text-ivoire-100" : "bg-surface text-ink-soft hover:bg-beige-100 hover:text-ink",
              )}
            >
              <Icon className="size-5 shrink-0" />
              <span className="flex-1 truncate text-left">{label}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section id="icones" title="Démo auto — flux de statuts">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="primary" dot>REGISTERED</Badge>
          <Flag className="size-4 text-ink-faint" aria-hidden="true" />
          <Badge tone="info" dot>FABRIC_RECEIVED</Badge>
          <Flag className="size-4 text-ink-faint" aria-hidden="true" />
          <Badge tone="info" dot>SEWING</Badge>
          <Flag className="size-4 text-ink-faint" aria-hidden="true" />
          <Badge tone="success" dot>READY_FOR_PICKUP</Badge>
          <Flag className="size-4 text-ink-faint" aria-hidden="true" />
          <Badge tone="success">DELIVERED</Badge>
          <Flag className="size-4 text-ink-faint" aria-hidden="true" />
          <span className="flex items-center gap-2"><Check className="size-4 text-success" /><span className="text-sm text-success">Encaissé</span></span>
        </div>
      </Section>
    </>
  );
}

export default function PlaygroundPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-10">
        <Badge tone="accent">Design System · V1</Badge>
        <h1 className="mt-3 font-display text-5xl text-ink">Guide de référence</h1>
        <p className="mt-2 max-w-2xl text-ink-soft">
          Fondations premium pour un atelier de couture. Mobile-first (320&nbsp;px → 1920&nbsp;px),
          tactile, accessible. Chaque composant suit les tokens de couleurs, typographie, espacement,
          radius et ombres documentés.
        </p>
      </header>

      <ToastProvider>
        <Demos />
      </ToastProvider>
    </main>
  );
}