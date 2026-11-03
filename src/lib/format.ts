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

/** 1200.5 → "1 200,5 DH" (fr) / "1,200.5 DH" (en). Display only — sums are done in SQL. */
export function formatMoney(value: number, locale: string): string {
  const n = new Intl.NumberFormat(locale === "en" ? "en-GB" : "fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })
    .format(value)
    .replace(/ | /g, " ");
  return `${n} DH`;
}
