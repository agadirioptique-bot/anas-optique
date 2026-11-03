import { z } from "zod";
import { label, optionalLabel, withEnglishFallback } from "../shared-schemas";

export const createLocationSchema = z.object({ labelFr: label, labelEn: optionalLabel.optional() }).transform(withEnglishFallback);
export const renameLocationSchema = z
  .object({ id: z.uuid(), labelFr: label, labelEn: optionalLabel.optional() })
  .transform(withEnglishFallback);
