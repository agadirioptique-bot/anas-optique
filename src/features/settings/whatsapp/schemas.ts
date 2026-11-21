import { z } from "zod";
import { TEMPLATE_KEYS, type TemplateKey } from "@/lib/whatsapp";

/** One text per message; empty = the default text (SPEC §8). */
const text = z.string().trim().max(1000);
export const whatsappTemplatesSchema = z.object(Object.fromEntries(TEMPLATE_KEYS.map((k) => [k, text])) as Record<TemplateKey, typeof text>);
export type WhatsappTemplatesInput = z.infer<typeof whatsappTemplatesSchema>;
