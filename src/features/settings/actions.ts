"use server";

import { adminWrite } from "./admin-action";
import { reorderSchema } from "./shared-schemas";

/** Drag-to-sort for any sortable settings table. */
export async function reorderRows(input: unknown) {
  return adminWrite(reorderSchema, input, (d, db) => db.rpc("reorder_rows", { p_table: d.table, p_ids: d.ids }));
}
