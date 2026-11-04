/** "Salma Bennani" → "SB". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** What a user typed in a money field ("1 200,50", "1,200.50 DH") → number, or null if unreadable. */
export function parseMoney(raw: string, locale: string): number | null {
  let s = raw.replace(/\s/g, "").replace(/dh/i, "");
  if (locale === "en") s = s.replace(/,/g, "");
  else if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const MINUS = "\u2212";
const NBSP = "\u00a0";

/** Intl uses a narrow no-break space in French; it almost vanishes in Inter, so use a regular one. */
const wide = (s: string) => s.replace(/\u202f|\u00a0/g, NBSP);

/** 1 250 DH (fr) · DH 1,250 (en). Negative amounts use a real minus sign. Display only — sums are done in SQL. */
export function formatMoney(amount: number, locale: string): string {
  const n = new Intl.NumberFormat(locale === "en" ? "en-GB" : "fr-FR", { maximumFractionDigits: 2 }).format(Math.abs(Math.round(amount * 100) / 100));
  const sign = amount < 0 ? MINUS : "";
  return locale === "en" ? `${sign}DH${NBSP}${wide(n)}` : `${sign}${wide(n)}${NBSP}DH`;
}

/** 12 k DH / DH 1.2M: chart axes only. */
export function formatMoneyCompact(amount: number, locale: string): string {
  const n = new Intl.NumberFormat(locale === "en" ? "en-GB" : "fr-FR", { notation: "compact", maximumFractionDigits: 1 }).format(Math.abs(amount));
  const sign = amount < 0 ? MINUS : "";
  return locale === "en" ? `${sign}DH${NBSP}${wide(n)}` : `${sign}${wide(n)}${NBSP}DH`;
}

/** 0.256 → 25,6 % (fr) / 25.6% (en). */
export function formatPercent(ratio: number, locale: string, digits = 0): string {
  return wide(new Intl.NumberFormat(locale === "en" ? "en-GB" : "fr-FR", { style: "percent", maximumFractionDigits: digits }).format(ratio));
}

/** Signed change: +12 % / −3,5 %. */
export function formatDelta(ratio: number, locale: string): string {
  const abs = formatPercent(Math.abs(ratio), locale, Math.abs(ratio) < 0.1 ? 1 : 0);
  return `${ratio < 0 ? MINUS : "+"}${abs}`;
}

/** +1.25 / −0.75 / 0.00 · null → — (optician notation). */
export function formatDiopter(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  if (value === 0) return "0.00";
  return `${value > 0 ? "+" : MINUS}${Math.abs(value).toFixed(2)}`;
}

export function formatAxis(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${Math.round(value)}°`;
}

/** What was typed in a prescription cell ("-0,75", "+1.5", "−2") → number, or null. */
export function parseDecimal(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, "").replace(",", ".").replace(MINUS, "-");
  if (cleaned === "" || cleaned === "-" || cleaned === "+") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
