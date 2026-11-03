"use client";

import { createClient } from "@/lib/supabase/client";
import { attachPrescriptionPhoto } from "../new/actions";

/** Uploads the photo under private/prescriptions/{orderId}/ then records its path on the order. */
export async function uploadPrescriptionPhoto(orderId: string, file: File): Promise<boolean> {
  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "jpg";
  const path = `prescriptions/${orderId}/${Date.now()}.${ext}`;
  const { error } = await createClient().storage.from("private").upload(path, file, { contentType: file.type, upsert: false });
  if (error) return false;
  const result = await attachPrescriptionPhoto({ orderId, path });
  return result.ok;
}
