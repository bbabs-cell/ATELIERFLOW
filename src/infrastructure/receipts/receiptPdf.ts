import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { formatFcfa } from "@/domain/money";
import { receiptFileName, type ReceiptDocument } from "@/domain/orders/receiptDocument";

/**
 * Rendu PDF du reçu (A5 portrait), entièrement dans le navigateur : il
 * fonctionne hors connexion et n'envoie aucune donnée à un service tiers.
 * Couleurs du Design System (espresso, flamme, champagne, wax, menthe) ;
 * polices PDF standard (Helvetica / Courier), encodage WinAnsi.
 */

const A5: [number, number] = [419.53, 595.28];
const MARGIN = 28;

function hex(value: string): RGB {
  const n = Number.parseInt(value.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

const C = {
  espresso: hex("#141110"),
  ink: hex("#211d16"),
  soft: hex("#5c5448"),
  faint: hex("#7a7163"),
  line: hex("#ede6da"),
  paper: hex("#f7f3ec"),
  gold: hex("#ecd06f"),
  goldDeep: hex("#9c7420"),
  flamme: hex("#ff5e2e"),
  flammeSoft: hex("#fff4ec"),
  flammeDeep: hex("#c2360f"),
  wax: hex("#e5337f"),
  waxSoft: hex("#fff0f7"),
  waxDeep: hex("#c21f66"),
  menthe: hex("#047857"),
  mentheSoft: hex("#ecfdf5"),
  white: rgb(1, 1, 1),
};

/** Dégradé « coucher de soleil » du Design System : flamme → champagne → wax. */
const STRIPE = ["#ff5e2e", "#ff9a4d", "#ecd06f", "#ff8cc0", "#e5337f"];

/**
 * Les polices standard ne couvrent que WinAnsi (latin occidental) :
 * espaces fines → espace insécable, apostrophes et tirets typographiques
 * conservés, tout autre caractère hors jeu → « ? » (jamais d'exception).
 */
const WIN_ANSI_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");
export function toWinAnsi(text: string): string {
  let out = "";
  for (const ch of text.normalize("NFC")) {
    const code = ch.codePointAt(0) ?? 0;
    if (ch === " " || ch === " " || ch === " ") out += " ";
    else if (ch === "\n" || ch === "\t") out += " ";
    else if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_EXTRA.has(ch)) out += ch;
    else out += "?";
  }
  return out;
}

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  oblique: PDFFont;
  mono: PDFFont;
  monoBold: PDFFont;
}

class Canvas {
  constructor(
    readonly page: PDFPage,
    readonly fonts: Fonts,
  ) {}

  get height() {
    return this.page.getHeight();
  }

  /** `top` : distance depuis le haut de la page (lecture naturelle). */
  text(value: string, x: number, top: number, size: number, font: PDFFont, color: RGB, opts?: { align?: "left" | "right"; spacing?: number }) {
    const safe = toWinAnsi(value);
    const spacing = opts?.spacing ?? 0;
    const width = font.widthOfTextAtSize(safe, size) + spacing * Math.max(0, safe.length - 1);
    const left = opts?.align === "right" ? x - width : x;
    if (spacing === 0) {
      this.page.drawText(safe, { x: left, y: this.height - top - size, size, font, color });
      return width;
    }
    let cursor = left;
    for (const ch of safe) {
      this.page.drawText(ch, { x: cursor, y: this.height - top - size, size, font, color });
      cursor += font.widthOfTextAtSize(ch, size) + spacing;
    }
    return width;
  }

  rect(x: number, top: number, w: number, h: number, color: RGB) {
    this.page.drawRectangle({ x, y: this.height - top - h, width: w, height: h, color });
  }

  roundRect(x: number, top: number, w: number, h: number, r: number, fill: RGB, border?: RGB) {
    const path = `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`;
    this.page.drawSvgPath(path, {
      x,
      y: this.height - top,
      color: fill,
      borderColor: border,
      borderWidth: border ? 0.8 : 0,
    });
  }

  line(x1: number, top: number, x2: number, color: RGB, dashed = false) {
    this.page.drawLine({
      start: { x: x1, y: this.height - top },
      end: { x: x2, y: this.height - top },
      thickness: 0.8,
      color,
      dashArray: dashed ? [3, 3] : undefined,
    });
  }

  /** Découpe en lignes tenant dans `width` (au mot ; mot trop long tronqué). */
  wrap(value: string, size: number, font: PDFFont, width: number, maxLines = 3): string[] {
    const words = toWinAnsi(value).split(/ +/).filter(Boolean);
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      current = word;
      while (font.widthOfTextAtSize(current, size) > width && current.length > 1) current = current.slice(0, -1);
    }
    if (current) lines.push(current);
    if (lines.length > maxLines) {
      const kept = lines.slice(0, maxLines);
      kept[maxLines - 1] = `${kept[maxLines - 1].replace(/.{0,2}$/, "")}…`;
      return kept;
    }
    return lines;
  }

  fit(value: string, size: number, font: PDFFont, width: number): string {
    let safe = toWinAnsi(value);
    if (font.widthOfTextAtSize(safe, size) <= width) return safe;
    while (safe.length > 1 && font.widthOfTextAtSize(`${safe}…`, size) > width) safe = safe.slice(0, -1);
    return `${safe}…`;
  }
}

const MAX_LINES = 7;

export async function renderReceiptPdf(doc: ReceiptDocument): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(toWinAnsi(`${doc.title} ${doc.reference}`));
  pdf.setAuthor(toWinAnsi(doc.atelier.name));
  pdf.setSubject(toWinAnsi(`${doc.title} — commande ${doc.order.reference}`));
  pdf.setCreator("AtelierFlow");
  pdf.setProducer("AtelierFlow");
  pdf.setCreationDate(new Date(doc.issuedAt));
  pdf.setModificationDate(new Date(doc.issuedAt));

  const page = pdf.addPage(A5);
  const fonts: Fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    oblique: await pdf.embedFont(StandardFonts.HelveticaOblique),
    mono: await pdf.embedFont(StandardFonts.Courier),
    monoBold: await pdf.embedFont(StandardFonts.CourierBold),
  };
  const c = new Canvas(page, fonts);
  const [W] = A5;
  const right = W - MARGIN;
  const inner = W - MARGIN * 2;
  const credit = doc.kind === "CREDIT";

  // --- En-tête espresso + liseré dégradé -------------------------------
  c.rect(0, 0, W, 104, C.espresso);
  const stripeW = W / STRIPE.length;
  STRIPE.forEach((color, i) => c.rect(i * stripeW, 104, stripeW + 0.5, 4, hex(color)));

  const nameLines = c.wrap(doc.atelier.name, 15, fonts.bold, inner * 0.56, 2);
  let top = 24;
  for (const l of nameLines) {
    c.text(l, MARGIN, top, 15, fonts.bold, C.white);
    top += 18;
  }
  for (const info of [doc.atelier.phone, doc.atelier.address]) {
    if (!info) continue;
    c.text(c.fit(info, 8.5, fonts.regular, inner * 0.56), MARGIN, top + 2, 8.5, fonts.regular, C.gold);
    top += 12;
  }

  c.text(doc.title.toUpperCase(), right, 24, 8, fonts.bold, credit ? hex("#ff8cc0") : hex("#ff9a4d"), { align: "right", spacing: 1.4 });
  c.text(doc.reference, right, 38, 12, fonts.monoBold, C.white, { align: "right" });
  c.text(doc.issuedAtLabel, right, 56, 8, fonts.regular, C.gold, { align: "right" });
  if (doc.provisional) {
    const label = "RÉFÉRENCE PROVISOIRE";
    const w = fonts.bold.widthOfTextAtSize(label, 6.5) + 14;
    c.roundRect(right - w, 72, w, 14, 7, C.wax);
    c.text(label, right - 7, 75.5, 6.5, fonts.bold, C.white, { align: "right" });
  }

  top = 126;

  // --- Bandeau d'information (contre-avoir / provisoire) ----------------
  const notices: Array<{ text: string; fill: RGB; ink: RGB }> = [];
  if (credit) {
    notices.push({
      text: `Ce contre-avoir annule le paiement de ${doc.payment.amountLabel}${doc.payment.cancellationReason ? ` — motif : ${doc.payment.cancellationReason}` : ""}. Le solde ci-dessous tient compte de l'annulation.`,
      fill: C.waxSoft,
      ink: C.waxDeep,
    });
  }
  if (doc.provisional) {
    notices.push({
      text: "Émis hors connexion : la référence sera confirmée à la prochaine synchronisation.",
      fill: C.paper,
      ink: C.soft,
    });
  }
  for (const notice of notices) {
    const lines = c.wrap(notice.text, 8, fonts.regular, inner - 20, 3);
    const h = lines.length * 11 + 12;
    c.roundRect(MARGIN, top, inner, h, 6, notice.fill);
    lines.forEach((l, i) => c.text(l, MARGIN + 10, top + 7 + i * 11, 8, fonts.regular, notice.ink));
    top += h + 8;
  }

  // --- Client | Commande ------------------------------------------------
  const colW = (inner - 12) / 2;
  const blocks: Array<{ label: string; main: string; sub: string | null; mono: boolean }> = [
    { label: "CLIENT", main: doc.customer.name, sub: doc.customer.phone, mono: false },
    { label: "COMMANDE", main: doc.order.reference, sub: null, mono: true },
  ];
  blocks.forEach((b, i) => {
    const x = MARGIN + i * (colW + 12);
    c.roundRect(x, top, colW, 48, 6, C.white, C.line);
    c.text(b.label, x + 10, top + 9, 6.5, fonts.bold, C.faint, { spacing: 1.2 });
    c.text(c.fit(b.main, 11, b.mono ? fonts.monoBold : fonts.bold, colW - 20), x + 10, top + 21, 11, b.mono ? fonts.monoBold : fonts.bold, C.ink);
    if (b.sub) c.text(c.fit(b.sub, 8.5, fonts.regular, colW - 20), x + 10, top + 35, 8.5, fonts.regular, C.soft);
  });
  top += 60;

  // --- Montant ------------------------------------------------------------
  const wordsLines = c.wrap(`Arrêté à la somme de ${doc.payment.amountInWords}.`, 8, fonts.oblique, inner - 24, 2);
  const amountH = 62 + wordsLines.length * 10;
  c.roundRect(MARGIN, top, inner, amountH, 8, credit ? C.waxSoft : C.flammeSoft);
  c.rect(MARGIN, top + 8, 3, amountH - 16, credit ? C.wax : C.flamme);
  c.text(credit ? "MONTANT ANNULÉ" : "MONTANT REÇU", MARGIN + 14, top + 11, 6.5, fonts.bold, credit ? C.waxDeep : C.flammeDeep, { spacing: 1.2 });
  c.text(doc.payment.amountLabel, MARGIN + 14, top + 24, 22, fonts.bold, C.ink);
  if (doc.payment.method) {
    const label = doc.payment.method;
    const w = fonts.bold.widthOfTextAtSize(toWinAnsi(label), 8) + 18;
    c.roundRect(right - 12 - w, top + 28, w, 17, 8.5, C.white, credit ? C.wax : C.flamme);
    c.text(label, right - 12 - w / 2 - fonts.bold.widthOfTextAtSize(toWinAnsi(label), 8) / 2, top + 32.5, 8, fonts.bold, credit ? C.waxDeep : C.flammeDeep);
  }
  wordsLines.forEach((l, i) => c.text(l, MARGIN + 14, top + 54 + i * 10, 8, fonts.oblique, C.soft));
  top += amountH + 14;

  // --- Détail de la commande --------------------------------------------
  if (doc.order.lines.length > 0) {
    const colQty = right - 150;
    const colUnit = right - 78;
    c.text("DÉSIGNATION", MARGIN, top, 6.5, fonts.bold, C.faint, { spacing: 1 });
    c.text("QTÉ", colQty, top, 6.5, fonts.bold, C.faint, { align: "right", spacing: 1 });
    c.text("P.U.", colUnit, top, 6.5, fonts.bold, C.faint, { align: "right", spacing: 1 });
    c.text("MONTANT", right, top, 6.5, fonts.bold, C.faint, { align: "right", spacing: 1 });
    top += 12;
    c.line(MARGIN, top, right, C.line);
    top += 6;
    // Place restante avant le récapitulatif et le pied de page : jamais de chevauchement.
    const reserved = 66 + (doc.payment.note ? 26 : 0) + 30;
    const fitting = Math.max(1, Math.min(MAX_LINES, Math.floor((A5[1] - 64 - reserved - top) / 15)));
    const shown = doc.order.lines.length > fitting ? doc.order.lines.slice(0, fitting - 1) : doc.order.lines;
    for (const line of shown) {
      c.text(c.fit(line.description, 8.5, fonts.regular, colQty - MARGIN - 30), MARGIN, top, 8.5, fonts.regular, C.ink);
      c.text(String(line.quantity), colQty, top, 8.5, fonts.regular, C.soft, { align: "right" });
      c.text(formatFcfa(line.unitPrice), colUnit, top, 8, fonts.regular, C.soft, { align: "right" });
      c.text(formatFcfa(line.total), right, top, 8.5, fonts.bold, C.ink, { align: "right" });
      top += 15;
    }
    if (shown.length < doc.order.lines.length) {
      const rest = doc.order.lines.length - shown.length;
      c.text(`… et ${rest} autre${rest > 1 ? "s" : ""} article${rest > 1 ? "s" : ""}`, MARGIN, top, 8, fonts.oblique, C.faint);
      top += 15;
    }
    c.line(MARGIN, top - 3, right, C.line);
    top += 8;
  }

  // --- Récapitulatif ----------------------------------------------------
  const sumX = MARGIN + inner * 0.42;
  const rows: Array<[string, string]> = [
    ["Total de la commande", formatFcfa(doc.state.total)],
    ["Déjà payé", formatFcfa(doc.state.totalPaid)],
  ];
  for (const [label, value] of rows) {
    c.text(label, sumX, top, 9, fonts.regular, C.soft);
    c.text(value, right, top, 9, fonts.bold, C.ink, { align: "right" });
    top += 15;
  }
  const tone = doc.balance.tone;
  const fill = tone === "settled" ? C.mentheSoft : tone === "surplus" ? C.paper : C.flammeSoft;
  const ink = tone === "settled" ? C.menthe : tone === "surplus" ? C.goldDeep : C.flammeDeep;
  c.roundRect(sumX - 10, top - 4, right - sumX + 10, 26, 6, fill);
  c.text(doc.balance.label, sumX, top + 4, 9.5, fonts.bold, ink);
  c.text(tone === "settled" ? "0 F CFA" : formatFcfa(doc.balance.amount), right - 10, top + 3, 11, fonts.bold, ink, { align: "right" });
  top += 36;

  if (doc.payment.note) {
    const lines = c.wrap(`Note : ${doc.payment.note}`, 8, fonts.oblique, inner, 2);
    lines.forEach((l, i) => c.text(l, MARGIN, top + i * 10, 8, fonts.oblique, C.soft));
    top += lines.length * 10 + 6;
  }

  // --- Pied de page -----------------------------------------------------
  const [, H] = A5;
  const footTop = H - 64;
  c.line(MARGIN, footTop, right, C.line, true);
  const footer = doc.atelier.footer ?? "Merci de votre confiance. Conservez ce reçu : il vous sera demandé au retrait.";
  c.wrap(footer, 8, fonts.regular, inner, 2).forEach((l, i) => c.text(l, MARGIN, footTop + 10 + i * 10, 8, fonts.regular, C.soft));
  c.text("Reçu émis avec AtelierFlow — document non modifiable.", MARGIN, H - 26, 6.5, fonts.regular, C.faint);
  c.text(receiptFileName(doc).replace(/\.pdf$/, ""), right, H - 26, 6.5, fonts.mono, C.faint, { align: "right" });

  return pdf.save();
}
