"use server";

import { adminWrite } from "../admin-action";
import { archiveSchema } from "../shared-schemas";
import { createLocationSchema, renameLocationSchema } from "./schemas";

/** Extra locations (e.g. "Véhicule", "Siège"); store/lab rows come from the stores trigger. */
export async function createChargeLocation(input: unknown) {
  return adminWrite(createLocationSchema, input, async (d, db) => {
    const { data: last } = await db.from("charge_locations").select("sort").order("sort", { ascending: false }).limit(1).maybeSingle();
    return db.from("charge_locations").insert({ label_fr: d.labelFr, label_en: d.labelEn, sort: (last?.sort ?? 0) + 1 });
  });
}

export async function renameChargeLocation(input: unknown) {
  return adminWrite(renameLocationSchema, input, (d, db) =>
    db.from("charge_locations").update({ label_fr: d.labelFr, label_en: d.labelEn }).eq("id", d.id),
  );
}

/** 'Général' always stays available. */
export async function setChargeLocationArchived(input: unknown) {
  return adminWrite(archiveSchema, input, (d, db) =>
    db.from("charge_locations").update({ is_archived: d.archived }).eq("id", d.id).eq("is_general", false),
  );
}
