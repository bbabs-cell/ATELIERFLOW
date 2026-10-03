/**
 * Objet signature de la vitrine : un vrai reçu d'atelier, tel que
 * l'application l'émet (acompte, reste à payer, référence REC-…). Il prouve
 * la promesse du titre mieux qu'une phrase.
 */
const LINES = [
  { label: "Robe de mariée", detail: "Satin duchesse, traîne", amount: "65 000" },
  { label: "Boubou brodé", detail: "Bazin riche, broderie or", amount: "20 000" },
];

export function ReceiptTicket(): React.ReactElement {
  return (
    <figure
      aria-label="Exemple de reçu émis par l'application"
      className="relative w-[19rem] max-w-full rotate-[1.5deg] rounded-sm bg-[#fbf6ec] px-6 pb-7 pt-6 font-mono text-[12px] leading-relaxed text-chocolat-900 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.6)] sm:w-[21rem]"
    >
      <div className="text-center">
        <p className="font-display text-base font-bold tracking-tight">Atelier Awa Couture</p>
        <p className="text-[11px] text-chocolat-500">Médina, Dakar · +221 77 000 00 00</p>
      </div>
      <div className="my-4 border-t border-dashed border-chocolat-300" />
      <p className="flex justify-between">
        <span>Reçu</span>
        <span className="font-semibold">REC-2026-000042</span>
      </p>
      <p className="flex justify-between text-chocolat-500">
        <span>Commande</span>
        <span>ORD-2026-000118</span>
      </p>
      <div className="my-4 border-t border-dashed border-chocolat-300" />
      <ul className="space-y-2">
        {LINES.map((line) => (
          <li key={line.label}>
            <p className="flex justify-between gap-3">
              <span>{line.label}</span>
              <span>{line.amount}</span>
            </p>
            <p className="text-[11px] text-chocolat-500">{line.detail}</p>
          </li>
        ))}
      </ul>
      <div className="my-4 border-t border-dashed border-chocolat-300" />
      <p className="flex justify-between font-semibold">
        <span>Total</span>
        <span>85 000 F CFA</span>
      </p>
      <p className="flex justify-between">
        <span>Acompte · Wave</span>
        <span>50 000</span>
      </p>
      <p className="mt-1 flex justify-between rounded bg-flamme-100 px-2 py-1 font-semibold text-flamme-700">
        <span>Reste à payer</span>
        <span>35 000</span>
      </p>
      <div className="my-4 border-t border-dashed border-chocolat-300" />
      <p className="text-center text-[11px] text-chocolat-500">Essayage samedi 12 · rappel WhatsApp envoyé</p>
      <p className="mt-3 text-center text-[11px] tracking-[0.2em] text-chocolat-400">MERCI DE VOTRE CONFIANCE</p>
      {/* bord dentelé du ticket */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 -bottom-2 h-2"
        style={{
          backgroundImage: "radial-gradient(circle at 6px 0, transparent 6px, #fbf6ec 6.5px)",
          backgroundSize: "12px 8px",
        }}
      />
    </figure>
  );
}
