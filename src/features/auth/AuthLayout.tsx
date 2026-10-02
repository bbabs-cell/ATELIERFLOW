import type { ReactNode } from "react";
import { CalendarClock, CheckCircle2, Ruler } from "lucide-react";
import { AmbientBlobs } from "@/ui/composites/AppShell";
import { Brand } from "./Brand";

const FEATURES = [
  "Fonctionne sans réseau",
  "Orange Money · Wave · Moov",
  "Reçus REC-AAAA-XXXXXX",
  "Mesures et historique",
  "Rendez-vous + WhatsApp",
  "Stock de tissus au mètre",
  "Équipe et permissions",
];

/** Reçu d'atelier animé (vitrine façon ticket de caisse). */
function ReceiptPreview() {
  const rows: [string, string, string?][] = [
    ["Grand boubou bazin", "50 000", "1 × 50 000"],
    ["Retouche robe wax", "7 500", "ourlet + taille"],
  ];
  return (
    <div className="relative mx-auto w-full max-w-sm">
      <div className="relative rotate-[-3deg] rounded-sm bg-ivoire-200 p-6 font-mono text-[12px] text-chocolat-900 shadow-modal animate-float">
        <div className="absolute inset-x-0 -top-2 h-2 bg-[radial-gradient(circle_at_6px_8px,transparent_5px,var(--color-ivoire-200)_5.5px)] bg-[length:12px_8px]" aria-hidden="true" />
        <p className="text-center text-[13px] font-medium uppercase tracking-[0.2em]">Atelier Awa Couture</p>
        <p className="mt-1 text-center text-[11px] text-chocolat-500">REC-2026-000042 · 16:24</p>
        <div className="mt-4 space-y-2">
          {rows.map(([label, amount, detail]) => (
            <div key={label}>
              <p className="flex justify-between gap-4">
                <span>{label}</span>
                <span>{amount}</span>
              </p>
              {detail ? <p className="pl-3 text-[11px] text-chocolat-500">{detail}</p> : null}
            </div>
          ))}
        </div>
        <div className="mt-3 border-t border-dashed border-chocolat-300 pt-3">
          <p className="flex justify-between font-medium">
            <span>TOTAL</span>
            <span>57 500</span>
          </p>
          <p className="mt-1 flex justify-between">
            <span>Acompte Wave</span>
            <span>20 000</span>
          </p>
          <p className="mt-1 flex justify-between text-flamme-600">
            <span>Reste</span>
            <span>37 500 F CFA</span>
          </p>
        </div>
        <p className="mt-4 border-t border-dashed border-chocolat-300 pt-3 text-center text-[11px] uppercase tracking-[0.2em]">
          Merci de votre confiance
        </p>
      </div>

      <div className="absolute -left-4 top-28 flex items-center gap-2 rounded-full bg-surface px-3 py-2 text-xs font-semibold text-ink shadow-lift animate-float sm:-left-10" style={{ animationDelay: "-1.5s" }}>
        <span className="grid size-6 place-items-center rounded-full bg-menthe-500 text-white">
          <Ruler className="size-3.5" aria-hidden="true" />
        </span>
        Mesures enregistrées
      </div>
      <div className="absolute -right-3 bottom-10 flex items-center gap-2 rounded-full bg-surface px-3 py-2 text-xs font-semibold text-ink shadow-lift animate-float sm:-right-8" style={{ animationDelay: "-3s" }}>
        <span className="grid size-6 place-items-center rounded-full bg-azur-500 text-white">
          <CalendarClock className="size-3.5" aria-hidden="true" />
        </span>
        Essayage 16:00
      </div>
      <div className="absolute -bottom-5 left-8 flex items-center gap-2 rounded-full bg-flamme-gradient px-3 py-2 text-xs font-semibold text-white shadow-glow animate-pop" style={{ animationDelay: "0.6s" }}>
        <CheckCircle2 className="size-4" aria-hidden="true" />
        Paiement synchronisé
      </div>
    </div>
  );
}

/**
 * Mise en page des écrans d'accès : vitrine sombre animée + formulaire.
 * Mobile : vitrine compacte au-dessus du formulaire.
 */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-chocolat-900 lg:grid lg:grid-cols-[1.1fr_1fr]">
      <section className="dot-grid relative overflow-hidden px-6 pb-10 pt-8 text-ivoire-50 sm:px-10 lg:flex lg:flex-col lg:justify-between lg:py-12">
        <AmbientBlobs dark />
        <div className="relative animate-fade-in">
          <Brand subtitle="Logiciel d'atelier de couture" />
        </div>

        <div className="relative mt-10 lg:mt-0">
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-champagne-300 animate-fade-up">
            Clients · Commandes · Paiements
          </p>
          <h1 className="mt-4 font-display text-4xl font-extrabold leading-[1.02] text-ivoire-50 animate-fade-up sm:text-6xl" style={{ animationDelay: "0.08s" }}>
            Coupez, cousez,
            <br />
            <span className="font-mono font-medium text-champagne-400">encaissez</span>
            <span className="text-gradient">.</span>
          </h1>
          <p className="mt-5 max-w-md text-base text-chocolat-200 animate-fade-up" style={{ animationDelay: "0.16s" }}>
            Mesures, commandes, acomptes et reçus de votre atelier — même quand le réseau
            tombe, tout se synchronise au retour du signal.
          </p>
          <div className="mt-10 hidden animate-fade-up lg:block" style={{ animationDelay: "0.24s" }}>
            <ReceiptPreview />
          </div>
        </div>

        <div className="relative -mx-6 mt-10 overflow-hidden border-t border-white/10 pt-4 sm:-mx-10" aria-hidden="true">
          <div className="flex w-max animate-marquee gap-8 whitespace-nowrap font-mono text-xs uppercase tracking-[0.18em] text-chocolat-200">
            {[...FEATURES, ...FEATURES].map((item, i) => (
              <span key={i} className="flex items-center gap-8">
                {item}
                <span className="text-flamme-400">✦</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="relative flex items-center justify-center overflow-hidden bg-bg px-4 py-10 sm:px-8 lg:rounded-l-[2.5rem]">
        <AmbientBlobs />
        <div className="dot-grid-ink pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="relative w-full max-w-md animate-scale-in">{children}</div>
      </section>
    </div>
  );
}
