import { z } from "zod";

/** Shared Server Action inputs (CLAUDE.md rule 9: every input goes through zod). */
export const uuidInput = z.uuid();

/** Free-text search box: trimmed and capped; `min` characters before searching. */
export const searchInput = (max: number, min = 0) => z.string().trim().min(min).transform((s) => s.slice(0, max));
