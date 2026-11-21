/** wa.me link for an E.164 phone ("+212612345678" → https://wa.me/212612345678?text=…). */
export function whatsappLink(e164: string, text: string): string {
  return `https://wa.me/${e164.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}

/**
 * The WhatsApp messages the super admin can rewrite in Settings › Messages WhatsApp (SPEC §8).
 * Stored in app_settings `whatsapp_templates`; a missing or empty text falls back to the default in
 * messages/*.json › whatsappMessages.
 */
export const TEMPLATE_KEYS = ["confirmed", "in_store", "delivered", "client_ready"] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];
export type WhatsappTemplates = Partial<Record<TemplateKey, string>>;

export type TemplateVariable = "admin" | "numero" | "client" | "prenom" | "magasin" | "total" | "avance" | "paye_aujourdhui" | "reste" | "remise";

/** Variables each message offers (insert buttons in Settings), in display order. */
export const TEMPLATE_VARIABLES: Record<TemplateKey, readonly TemplateVariable[]> = {
  confirmed: ["admin", "numero", "client", "magasin", "total", "avance", "reste"],
  in_store: ["admin", "numero", "client", "magasin", "total", "avance", "reste"],
  delivered: ["admin", "numero", "client", "magasin", "total", "avance", "paye_aujourdhui", "remise"],
  client_ready: ["prenom", "client", "numero", "magasin", "total", "reste"],
};

/** The saved text, or the default when nothing (or only spaces) was saved. */
export function resolveTemplate(saved: string | undefined, fallback: string): string {
  return saved?.trim() ? saved : fallback;
}

/** "Bonjour {client}" + { client: "Salma" } → "Bonjour Salma". Unknown variables stay as typed. */
export function fillTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (match, key: string) => (Object.hasOwn(vars, key) ? vars[key] : match));
}
