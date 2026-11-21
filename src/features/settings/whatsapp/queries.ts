import "server-only";
import { createClient } from "@/lib/supabase/server";
import { TEMPLATE_KEYS, type WhatsappTemplates } from "@/lib/whatsapp";

/** Texts saved in Settings › Messages WhatsApp (every signed-in user reads app_settings). */
export async function getWhatsappTemplates(): Promise<WhatsappTemplates> {
  const db = await createClient();
  const { data } = await db.from("app_settings").select("value").eq("key", "whatsapp_templates").maybeSingle();
  const saved = (data?.value ?? {}) as Record<string, unknown>;
  const templates: WhatsappTemplates = {};
  for (const key of TEMPLATE_KEYS) {
    const value = saved[key];
    if (typeof value === "string" && value.trim()) templates[key] = value;
  }
  return templates;
}
