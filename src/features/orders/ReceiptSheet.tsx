import { formatFcfa } from "@/domain/money";
import type { ReceiptDocument } from "@/domain/orders/receiptDocument";
import { cx } from "@/lib/cx";

/**
 * Aperçu HTML du reçu — même modèle et même mise en page que le PDF,
 * utilisé à l'écran et à l'impression.
 */
export function ReceiptSheet({ doc, className }: { doc: ReceiptDocument; className?: string }) {
  const credit = doc.kind === "CREDIT";
  const tone = doc.balance.tone;
  return (
    <article
      className={cx(
        "receipt-sheet @container mx-auto w-full max-w-[30rem] overflow-hidden rounded-2xl border border-outline bg-white text-[13px] text-anthracite-900 shadow-lift",
        className,
      )}
      aria-label={`${doc.title} ${doc.reference}`}
    >
      <header className="relative bg-chocolat-950 px-5 pb-5 pt-4 text-white">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-display text-lg font-bold leading-tight break-words">{doc.atelier.name}</p>
            {doc.atelier.phone ? <p className="mt-1 text-xs text-menthe-300">{doc.atelier.phone}</p> : null}
            {doc.atelier.address ? <p className="text-xs text-menthe-300">{doc.atelier.address}</p> : null}
          </div>
          <div className="shrink-0 text-right">
            <p className={cx("text-[10px] font-bold uppercase tracking-[0.18em]", credit ? "text-wax-300" : "text-menthe-300")}>
              {doc.title}
            </p>
            <p className="mt-1 font-mono text-sm font-semibold">{doc.reference}</p>
            <p className="mt-1 text-[11px] text-menthe-300">{doc.issuedAtLabel}</p>
            {doc.provisional ? (
              <span className="mt-2 inline-block rounded-full bg-wax-500 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider">
                Référence provisoire
              </span>
            ) : null}
          </div>
        </div>
        <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1 bg-menthe-gradient" />
      </header>

      <div className="flex flex-col gap-3 p-5">
        {credit ? (
          <p className="rounded-lg bg-wax-50 px-3 py-2 text-xs text-wax-600">
            Ce contre-avoir annule le paiement de {doc.payment.amountLabel}
            {doc.payment.cancellationReason ? ` — motif : ${doc.payment.cancellationReason}` : ""}. Le solde ci-dessous tient
            compte de l&apos;annulation.
          </p>
        ) : null}
        {doc.provisional ? (
          <p className="rounded-lg bg-anthracite-50 px-3 py-2 text-xs text-anthracite-600">
            Émis hors connexion : la référence sera confirmée à la prochaine synchronisation.
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0 rounded-xl border border-anthracite-100 px-3 py-2.5">
            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-anthracite-500">Client</p>
            <p className="truncate font-bold">{doc.customer.name}</p>
            {doc.customer.phone ? <p className="truncate text-xs text-anthracite-600">{doc.customer.phone}</p> : null}
          </div>
          <div className="min-w-0 rounded-xl border border-anthracite-100 px-3 py-2.5">
            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-anthracite-500">Commande</p>
            <p className="truncate font-mono font-semibold">{doc.order.reference}</p>
          </div>
        </div>

        <div className={cx("relative rounded-xl py-3 pl-5 pr-3", credit ? "bg-wax-50" : "bg-menthe-50")}>
          <span aria-hidden="true" className={cx("absolute inset-y-3 left-0 w-1 rounded-r", credit ? "bg-wax-500" : "bg-menthe-500")} />
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className={cx("text-[9px] font-bold uppercase tracking-[0.16em]", credit ? "text-wax-600" : "text-menthe-600")}>
                {credit ? "Montant annulé" : "Montant reçu"}
              </p>
              <p className="font-display text-3xl font-extrabold tabular">{doc.payment.amountLabel}</p>
            </div>
            {doc.payment.method ? (
              <span className={cx("rounded-full border bg-white px-3 py-1 text-xs font-bold", credit ? "border-wax-500 text-wax-600" : "border-menthe-500 text-menthe-600")}>
                {doc.payment.method}
              </span>
            ) : null}
          </div>
          <p className="mt-1.5 text-xs italic text-anthracite-600">Arrêté à la somme de {doc.payment.amountInWords}.</p>
        </div>

        {doc.order.lines.length > 0 ? (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-anthracite-100 text-[9px] uppercase tracking-[0.12em] text-anthracite-500">
                <th className="py-1.5 text-left font-bold">Désignation</th>
                <th className="py-1.5 pl-3 text-right font-bold">Qté</th>
                <th className="hidden py-1.5 pl-3 text-right font-bold @md:table-cell">P.U.</th>
                <th className="py-1.5 pl-3 text-right font-bold">Montant</th>
              </tr>
            </thead>
            <tbody>
              {doc.order.lines.map((line, i) => (
                <tr key={i} className="border-b border-anthracite-100/60 last:border-0">
                  <td className="py-1.5 pr-2 break-words">{line.description}</td>
                  <td className="py-1.5 pl-3 text-right align-top tabular text-anthracite-600">{line.quantity}</td>
                  <td className="hidden whitespace-nowrap py-1.5 pl-3 text-right align-top tabular text-anthracite-600 @md:table-cell">{formatFcfa(line.unitPrice)}</td>
                  <td className="whitespace-nowrap py-1.5 pl-3 text-right align-top font-semibold tabular">{formatFcfa(line.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}

        <dl className="ml-auto flex w-full max-w-64 flex-col gap-1.5 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-anthracite-600">Total de la commande</dt>
            <dd className="font-bold tabular">{formatFcfa(doc.state.total)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-anthracite-600">Déjà payé</dt>
            <dd className="font-bold tabular">{formatFcfa(doc.state.totalPaid)}</dd>
          </div>
          <div
            className={cx(
              "flex justify-between gap-3 rounded-lg px-2.5 py-1.5 font-bold",
              tone === "settled" ? "bg-menthe-50 text-menthe-600" : tone === "surplus" ? "bg-anthracite-50 text-menthe-600" : "bg-menthe-50 text-menthe-600",
            )}
          >
            <dt>{doc.balance.label}</dt>
            <dd className="tabular">{formatFcfa(doc.balance.amount)}</dd>
          </div>
        </dl>

        {doc.payment.note ? <p className="text-xs italic text-anthracite-600">Note : {doc.payment.note}</p> : null}

        <footer className="mt-1 border-t border-dashed border-anthracite-300 pt-3 text-xs text-anthracite-600">
          <p>{doc.atelier.footer ?? "Merci de votre confiance. Conservez ce reçu : il vous sera demandé au retrait."}</p>
          <p className="mt-2 flex justify-between gap-2 text-[10px] text-anthracite-500">
            <span>Reçu émis avec AtelierFlow — document non modifiable.</span>
          </p>
        </footer>
      </div>
    </article>
  );
}
