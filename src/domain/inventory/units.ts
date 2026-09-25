const NBSP = "\u00A0";

export function parseCentiUnits(input: string): number | null {
  const normalized = input
    .trim()
    .replace(/[\u00A0\u202F\s]/g, "")
    .replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const [whole = "0", frac = ""] = normalized.split(".");
  const units = Number(whole);
  if (!Number.isSafeInteger(units)) return null;
  const fraction = frac.length === 1 ? Number(frac) * 10 : Number(frac) || 0;
  const total = units * 100 + fraction;
  return Number.isSafeInteger(total) ? total : null;
}

export function formatCentiUnits(value: number): string {
  const abs = Math.abs(Math.trunc(value));
  const units = Math.floor(abs / 100);
  const fraction = abs % 100;
  const sign = value < 0 ? "-" : "";
  const grouped = String(units).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return `${sign}${grouped},${String(fraction).padStart(2, "0")}`;
}

export function formatMeters(value: number): string {
  return `${formatCentiUnits(value)} m`;
}