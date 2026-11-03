import { z } from "zod";

export const activeStoreSchema = z.string().trim().min(1).max(64);
