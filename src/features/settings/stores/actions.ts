"use server";

import { adminWrite } from "../admin-action";
import { createStoreSchema, storeActiveSchema, updateStoreSchema } from "./schemas";

/** Its charge location is created by a database trigger. One lab at most. */
export async function createStore(input: unknown) {
  return adminWrite(
    createStoreSchema,
    input,
    async (d, db) => {
      if (d.kind === "lab") {
        const { data: lab } = await db.from("stores").select("id").eq("kind", "lab").maybeSingle();
        if (lab) return { fail: "labExists" as const };
      }
      return db.from("stores").insert(d);
    },
    { onUnique: "prefixTaken" },
  );
}

/** A used prefix is refused by the database (OPTICOR:PREFIX_LOCKED). */
export async function updateStore(input: unknown) {
  return adminWrite(
    updateStoreSchema,
    input,
    (d, db) => db.from("stores").update({ name: d.name, prefix: d.prefix, address: d.address, phone: d.phone }).eq("id", d.id),
    { onUnique: "prefixTaken" },
  );
}

/** Deactivate, never delete (SPEC §5.1). */
export async function setStoreActive(input: unknown) {
  return adminWrite(storeActiveSchema, input, (d, db) => db.from("stores").update({ is_active: d.active }).eq("id", d.id));
}
