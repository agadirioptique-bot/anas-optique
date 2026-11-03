/** FR/EN label of a settings row for the current locale (falls back to French). */
export function localized(row: { label_fr: string; label_en: string }, locale: string): string {
  return locale === "en" && row.label_en.trim() ? row.label_en : row.label_fr;
}
