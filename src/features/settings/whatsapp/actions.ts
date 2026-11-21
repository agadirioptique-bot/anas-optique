"use server";

import { adminWrite } from "../admin-action";
import { whatsappTemplatesSchema } from "./schemas";

/** Saves the WhatsApp texts (super admin; RLS on app_settings). Empty texts are dropped: the default applies. */
export async function setWhatsappTemplates(input: unknown) {
  return adminWrite(whatsappTemplatesSchema, input, (d, db) =>
    db.from("app_settings").upsert({ key: "whatsapp_templates", value: Object.fromEntries(Object.entries(d).filter(([, v]) => v !== "")) }),
  );
}
