import Link from "next/link";
import {
  Bell,
  CalendarDays,
  ClipboardList,
  CloudOff,
  Coins,
  FileText,
  Ruler,
  Scissors,
  Smartphone,
  UsersRound,
} from "lucide-react";
import { BRAND_NAME } from "@/config/brand";
import { Brand } from "@/features/auth/Brand";
import { PublicPricing } from "./PublicPricing";
import { ReceiptTicket } from "./ReceiptTicket";

/**
 * Page vitrine (visiteurs non connectés). Même construction que les
 * vitrines MagyaPro : une promesse et sa preuve côte à côte (le reçu),
 * le problème, le fonctionnement en quatre étapes, ce qui distingue
 * l'application, les tarifs en direct, les questions, un dernier appel.
 * Chaque fonction citée existe dans l'application.
 */
const SIGNUP = "/connexion?inscription=1";
const WRAP = "mx-auto w-full max-w-6xl px-4 sm:px-6";
const H2 = "font-display text-2xl font-extrabold tracking-[-0.02em] text-ivoire-50 sm:text-4xl";
const DOTS = {
  backgroundImage: "radial-gradient(circle, #f6f0e4 1px, transparent 1px)",
  backgroundSize: "26px 26px",
};

const PROBLEMS = [
  {
    term: "Les mesures ne se perdent plus",
    detail: "Tour de poitrine, longueur de manche, carrure : chaque cliente garde ses mesures, avec l'historique de chaque prise. Plus de page arrachée dans le cahier.",
  },
  {
    term: "Le reste à payer se calcule tout seul",
    detail: "Acompte en espèces, complément par Wave ou Orange Money : chaque versement est enregistré, le reste à payer et le surplus sont toujours justes.",
  },
  {
    term: "Chaque commande a son étape",
    detail: "Tissu reçu, coupe, couture, essayage, retouches, prête à retirer : vous voyez d'un coup d'œil où en est chaque robe, et ce qui est en retard.",
  },
  {
    term: "Le travail continue sans réseau",
    detail: "Vous enregistrez une cliente ou un paiement même quand la connexion coupe. Tout se synchronise au retour du signal, sur tous vos appareils.",
  },
  {
    term: "Vos données restent les vôtres",
    detail: "Chaque atelier est un espace séparé. Personne d'autre ne voit vos clientes, vos commandes ni votre chiffre d'affaires.",
  },
];

const STEPS = [
  { title: "Créez votre compte", detail: "Nom, e-mail, mot de passe. Rien de plus.", icon: UsersRound },
  { title: "Nommez votre atelier", detail: "Son nom, votre numéro, votre adresse : ils apparaissent sur vos reçus.", icon: Scissors },
  { title: "Ajoutez une cliente", detail: "Son téléphone, ses mesures, une photo du modèle si vous voulez.", icon: Ruler },
  { title: "Prenez la commande", detail: "Articles, prix, acompte : le reçu est prêt à imprimer ou à envoyer.", icon: ClipboardList },
];

const SIGNATURES = [
  {
    title: "Le reçu qui dit la vérité",
    detail: "Chaque paiement produit un reçu numéroté (REC-2026-…) avec le total, ce qui a été versé et ce qui reste. Un paiement annulé donne un contre-avoir : rien ne s'efface, tout se justifie.",
    icon: FileText,
  },
  {
    title: "La cliente prévenue sur WhatsApp",
    detail: "Rendez-vous d'essayage, de retrait ou de livraison : le message de rappel est préparé, vous l'envoyez en un geste depuis votre téléphone.",
    icon: Bell,
  },
  {
    title: "L'atelier dans la poche",
    detail: "Téléphone, tablette ou ordinateur, sans rien installer. L'application s'ouvre même hors connexion, comme une application du téléphone.",
    icon: Smartphone,
  },
];

const GROUPS = [
  {
    group: "Clientes et mesures",
    items: [
      { term: "Fiche cliente", detail: "Téléphone, WhatsApp, notes, photos, recherche instantanée." },
      { term: "Profils de mesures", detail: "Plusieurs profils par cliente, historique de chaque prise." },
    ],
  },
  {
    group: "Commandes et équipe",
    items: [
      { term: "Tableau de l'atelier", detail: "Les commandes par étape, priorité et date de retrait." },
      { term: "Affectation", detail: "Chaque commande confiée à un tailleur ou une couturière." },
      { term: "Rôles", detail: "Propriétaire, gérant, employé, apprenti : chacun voit ce qu'il doit voir." },
    ],
  },
  {
    group: "Argent et stock",
    items: [
      { term: "Paiements partiels", detail: "Espèces, Wave, Orange Money, Moov, virement." },
      { term: "Tableau de bord", detail: "Encaissé, reste à percevoir, commandes en retard." },
      { term: "Stock de tissus", detail: "Entrées et sorties au mètre, alerte quand un tissu manque." },
    ],
  },
];

const FAQ = [
  {
    q: "Faut-il savoir se servir d'un ordinateur ?",
    a: "Non. Tout se fait depuis un téléphone, avec de grands boutons et des étapes guidées. Si vous savez envoyer un message WhatsApp, vous savez vous en servir.",
  },
  {
    q: "Que se passe-t-il si la connexion coupe ?",
    a: "Vous continuez à travailler. Ce que vous enregistrez reste sur l'appareil et part tout seul vers le serveur dès que le réseau revient.",
  },
  {
    q: "Puis-je l'utiliser sur plusieurs téléphones ?",
    a: "Oui. Vous, votre gérant et vos employés voyez le même atelier, chacun avec son propre accès et ses propres droits.",
  },
  {
    q: "Comment payer l'abonnement ?",
    a: "Par Wave, Orange Money ou transfert. Vous envoyez le montant au numéro indiqué, vous joignez la capture du transfert, et le plan est activé après vérification.",
  },
  {
    q: "Mes clientes reçoivent-elles un reçu ?",
    a: "Oui. Chaque paiement donne un reçu numéroté au nom de votre atelier, à imprimer ou à envoyer en PDF.",
  },
  {
    q: "Mes données sont-elles en sécurité ?",
    a: "Chaque atelier est isolé des autres, les accès sont protégés et vos photos sont stockées dans un espace privé. Rien n'est jamais supprimé par erreur : une annulation laisse toujours une trace.",
  },
];

function PrimaryCta({ children = "Commencer gratuitement" }: { children?: React.ReactNode }) {
  return (
    <Link
      href={SIGNUP}
      className="inline-flex items-center justify-center rounded-xl bg-flamme-500 px-7 py-4 font-display text-sm font-semibold text-white shadow-[0_10px_30px_-10px_var(--color-flamme-500)] transition-colors hover:bg-flamme-600 active:translate-y-px"
    >
      {children}
    </Link>
  );
}

export function VitrinePage(): React.ReactElement {
  return (
    <div className="min-h-dvh bg-chocolat-900 text-ivoire-50">
      {/* ------------------------------------------------------------ En-tête */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-chocolat-900/80 backdrop-blur-xl">
        <nav aria-label="Navigation principale" className={`${WRAP} flex h-16 items-center justify-between gap-4`}>
          <Link href="/" aria-label={`${BRAND_NAME}, accueil`}>
            <Brand subtitle="Gestion d'atelier" />
          </Link>
          <div className="hidden items-center gap-7 text-sm text-ivoire-50/65 md:flex">
            <a href="#fonctionnalites" className="hover:text-ivoire-50">Fonctionnalités</a>
            <a href="#fonctionnement" className="hover:text-ivoire-50">Fonctionnement</a>
            <a href="#tarifs" className="hover:text-ivoire-50">Tarifs</a>
            <a href="#faq" className="hover:text-ivoire-50">FAQ</a>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/connexion" className="hidden rounded-xl px-4 py-2.5 text-sm font-medium text-ivoire-50/80 hover:text-ivoire-50 sm:inline-flex">
              Connexion
            </Link>
            <Link href={SIGNUP} className="inline-flex rounded-xl bg-flamme-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-flamme-600">
              Essayer
            </Link>
          </div>
        </nav>
      </header>

      <main id="contenu">
        {/* ------------------------------------------------------------ Promesse */}
        <section className="relative overflow-hidden border-b border-white/10">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.06]" style={DOTS} />
          <div className={`${WRAP} relative py-16 sm:py-24 lg:py-28`}>
            <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-20">
              <div className="animate-fade-up max-w-2xl">
                <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-flamme-400">
                  Pour tailleurs, couturières et ateliers de couture
                </p>
                <h1 className="mt-7 font-display text-[2.75rem] font-extrabold leading-[0.95] tracking-[-0.03em] text-ivoire-50 sm:text-6xl lg:text-[4.25rem]">
                  Coupez, cousez,
                  <span className="mt-2 block font-mono text-[2.4rem] font-medium tracking-[-0.01em] text-flamme-400 sm:text-5xl lg:text-[3.6rem]">
                    encaissez.
                  </span>
                </h1>
                <p className="mt-7 max-w-xl text-base leading-relaxed text-ivoire-50/70 sm:text-lg">
                  Les mesures de vos clientes, l&apos;avancement de chaque commande, les acomptes et
                  le reste à payer : tout votre atelier dans le téléphone, même quand le réseau tombe.
                </p>
                <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                  <PrimaryCta />
                  <a
                    href="#fonctionnement"
                    className="inline-flex items-center justify-center rounded-xl border border-ivoire-50/20 px-7 py-4 font-display text-sm font-medium text-ivoire-50 transition-colors hover:bg-white/5"
                  >
                    Voir comment ça marche
                  </a>
                </div>
              </div>
              <div className="justify-self-center lg:justify-self-end">
                <ReceiptTicket />
              </div>
            </div>
          </div>
        </section>

        {/* --------------------------------------------------------- Assurances */}
        <section className={`${WRAP} pt-12`}>
          <ul className="flex flex-wrap gap-x-8 gap-y-2 border-y border-white/10 py-4 font-mono text-[11px] uppercase tracking-[0.18em] text-ivoire-50/50">
            <li>14 jours d&apos;essai complet</li>
            <li>Sans carte bancaire</li>
            <li>Fonctionne sans connexion</li>
            <li>Paiement par Wave ou Orange Money</li>
          </ul>
        </section>

        {/* ------------------------------------------------------------ Problème */}
        <section className={`${WRAP} py-14 sm:py-20`}>
          <h2 className={`${H2} max-w-3xl`}>Un cahier ne vous dit pas quelle robe est en retard.</h2>
          <p className="mt-5 max-w-[65ch] text-ivoire-50/65">
            Il garde des chiffres, mais il ne calcule pas le reste à payer, ne prévient pas la
            cliente de son essayage et se perd le jour où on en a besoin. {BRAND_NAME} a été pensé
            pour la vie d&apos;un atelier : des mesures, des tissus, des acomptes, des délais.
          </p>
          <dl className="mt-12 grid gap-x-12 border-t border-white/10 sm:grid-cols-2">
            {PROBLEMS.map((item, index) => (
              <div
                key={item.term}
                className={`border-b border-white/10 py-6 ${index === PROBLEMS.length - 1 && PROBLEMS.length % 2 === 1 ? "sm:col-span-2" : ""}`}
              >
                <dt className="font-display font-semibold text-ivoire-50">{item.term}</dt>
                <dd className="mt-1.5 max-w-[52ch] text-sm leading-relaxed text-ivoire-50/60">{item.detail}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* ------------------------------------------------------- Fonctionnement */}
        <section id="fonctionnement" className="relative scroll-mt-16 overflow-hidden bg-black/20">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.05]" style={DOTS} />
          <div className={`${WRAP} relative py-16 sm:py-24`}>
            <div className="max-w-2xl">
              <h2 className={H2}>Comment ça fonctionne</h2>
              <p className="mt-3 text-ivoire-50/60">Quatre étapes, et votre premier reçu est prêt.</p>
            </div>
            <ol className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((step, i) => (
                <li key={step.title} className="group overflow-hidden rounded-2xl border border-white/10 bg-white/5 transition-colors hover:border-white/25">
                  <div className="relative grid h-32 place-items-center bg-gradient-to-br from-flamme-500/35 via-chocolat-700/40 to-chocolat-900">
                    <step.icon className="size-10 text-ivoire-50/80 transition-transform duration-300 group-hover:scale-110" aria-hidden="true" />
                    <span className="absolute bottom-3 left-4 grid size-9 place-items-center rounded-lg bg-flamme-500 text-sm font-bold text-white shadow-lg">
                      {i + 1}
                    </span>
                  </div>
                  <div className="p-5">
                    <h3 className="font-semibold text-ivoire-50">{step.title}</h3>
                    <p className="mt-1 text-sm text-ivoire-50/55">{step.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ------------------------------------------------------ Fonctionnalités */}
        <section id="fonctionnalites" className={`${WRAP} scroll-mt-16 py-16 sm:py-24`}>
          <h2 className={`${H2} max-w-2xl`}>Trois choses qu&apos;un cahier ne fera jamais</h2>
          <div className="mt-12 grid gap-10 border-t border-white/10 pt-10 lg:grid-cols-3 lg:gap-0">
            {SIGNATURES.map((item) => (
              <div key={item.title} className="lg:border-l lg:border-white/10 lg:px-8 lg:first:border-l-0 lg:first:pl-0">
                <span className="grid size-11 place-items-center rounded-xl bg-flamme-500/15 text-flamme-400">
                  <item.icon className="size-5" aria-hidden="true" />
                </span>
                <h3 className="mt-5 font-display text-xl font-bold tracking-[-0.01em] text-ivoire-50">{item.title}</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-ivoire-50/65">{item.detail}</p>
              </div>
            ))}
          </div>

          <h3 className="mt-20 font-display text-xl font-bold tracking-[-0.01em] text-ivoire-50">
            Et tout ce qu&apos;un atelier attend d&apos;un logiciel
          </h3>
          <div className="mt-8 grid gap-x-12 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {GROUPS.map((cluster, i) => {
              const Icon = [UsersRound, CalendarDays, Coins][i];
              return (
                <div key={cluster.group}>
                  <h4 className="flex items-center gap-2 border-b border-white/10 pb-3 font-display text-sm font-semibold text-flamme-400">
                    <Icon className="size-4" aria-hidden="true" />
                    {cluster.group}
                  </h4>
                  <dl className="mt-5 space-y-5">
                    {cluster.items.map((item) => (
                      <div key={item.term}>
                        <dt className="text-sm font-medium text-ivoire-50">{item.term}</dt>
                        <dd className="mt-1 text-sm leading-relaxed text-ivoire-50/55">{item.detail}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              );
            })}
          </div>
        </section>

        {/* ---------------------------------------------------------------- Hors ligne */}
        <section className="border-y border-white/10 bg-black/20">
          <div className={`${WRAP} grid items-center gap-8 py-14 sm:grid-cols-[auto_1fr] sm:py-16`}>
            <span className="grid size-16 place-items-center rounded-2xl bg-white/5 text-flamme-400">
              <CloudOff className="size-8" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-display text-xl font-bold text-ivoire-50 sm:text-2xl">Coupure de réseau ? L&apos;atelier continue.</h2>
              <p className="mt-2 max-w-[70ch] text-ivoire-50/65">
                Une cliente passe pendant une coupure : vous notez ses mesures, sa commande et son
                acompte. Au retour du signal, tout part vers le serveur et apparaît sur les autres
                téléphones de l&apos;atelier, sans doublon.
              </p>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------------- Tarifs */}
        <section id="tarifs" className={`${WRAP} scroll-mt-16 py-16 sm:py-24`}>
          <div className="max-w-2xl">
            <h2 className={H2}>Des tarifs lisibles</h2>
            <p className="mt-3 text-ivoire-50/60">
              Un plan gratuit pour démarrer, 14 jours d&apos;essai complet à la création de l&apos;atelier,
              sans engagement. Paiement par Wave, Orange Money ou transfert.
            </p>
          </div>
          <PublicPricing />
        </section>

        {/* ----------------------------------------------------------------- FAQ */}
        <section id="faq" className="scroll-mt-16 border-t border-white/10 bg-black/20">
          <div className={`${WRAP} py-16 sm:py-24`}>
            <h2 className={H2}>Questions fréquentes</h2>
            <div className="mt-10 max-w-3xl divide-y divide-white/10 border-y border-white/10">
              {FAQ.map((item) => (
                <details key={item.q} className="group py-4">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 font-medium text-ivoire-50">
                    {item.q}
                    <span aria-hidden="true" className="shrink-0 text-xl text-ivoire-50/40 transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-2 text-sm leading-relaxed text-ivoire-50/60">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------- Dernier appel */}
        <section className="border-t border-white/10">
          <div className={`${WRAP} py-20 text-center sm:py-28`}>
            <h2 className={H2}>Votre atelier, organisé dès aujourd&apos;hui.</h2>
            <p className="mx-auto mt-4 max-w-xl text-ivoire-50/65">
              Créez votre compte, ajoutez votre première cliente, prenez sa commande. Vous pourrez tout
              modifier ensuite.
            </p>
            <div className="mt-9">
              <PrimaryCta />
            </div>
          </div>
        </section>
      </main>

      {/* --------------------------------------------------------------- Pied */}
      <footer className="border-t border-white/10 bg-chocolat-950">
        <div className={`${WRAP} flex flex-col gap-6 py-10 sm:flex-row sm:items-center sm:justify-between`}>
          <div>
            <p className="font-display font-semibold text-ivoire-50">{BRAND_NAME}</p>
            <p className="mt-1 text-sm text-ivoire-50/50">La gestion d&apos;atelier de couture, pensée pour le téléphone.</p>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-ivoire-50/60">
            <a href="#fonctionnalites" className="hover:text-ivoire-50">Fonctionnalités</a>
            <a href="#tarifs" className="hover:text-ivoire-50">Tarifs</a>
            <a href="#faq" className="hover:text-ivoire-50">FAQ</a>
            <Link href="/connexion" className="hover:text-ivoire-50">Connexion</Link>
          </div>
        </div>
        <p className={`${WRAP} pb-8 text-xs text-ivoire-50/35`}>
          © {new Date().getFullYear()} {BRAND_NAME}. Tous droits réservés.
        </p>
      </footer>
    </div>
  );
}
