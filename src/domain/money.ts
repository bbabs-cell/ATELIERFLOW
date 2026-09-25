export const CURRENCY = "EUR";

export function parseEurosToCentimes(input: string): number | null {
  const normalized = input
    .trim()
    .replace(/[\u00A0\u202F\s]/g, "")
    .replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const [whole = "0", frac = ""] = normalized.split(".");
  const euros = Number(whole);
  if (!Number.isSafeInteger(euros)) return null;
  const cents = frac.length === 1 ? Number(frac) * 10 : Number(frac) || 0;
  const total = euros * 100 + cents;
  return Number.isSafeInteger(total) ? total : null;
}

function groupThousands(value: number): string {
  const s = String(value);
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0");
}

export function formatEuros(centimes: number): string {
  const abs = Math.abs(Math.trunc(centimes));
  const euros = Math.floor(abs / 100);
  const cents = abs % 100;
  const sign = centimes < 0 ? "-" : "";
  return `${sign}${groupThousands(euros)},${String(cents).padStart(2, "0")} €`;
}

export function lineTotal(source: {
  quantity: number;
  unitPrice: number;
}): number | null {
  if (!Number.isSafeInteger(source.unitPrice) || source.unitPrice < 0) return null;
  if (!Number.isSafeInteger(source.quantity) || source.quantity <= 0) return null;
  const total = source.quantity * source.unitPrice;
  return Number.isSafeInteger(total) ? total : null;
}

export function sumCentimes(amounts: readonly number[]): number | null {
  let total = 0;
  for (const amount of amounts) {
    if (!Number.isSafeInteger(amount) || amount < 0) return null;
    total += amount;
    if (!Number.isSafeInteger(total)) return null;
  }
  return total;
}