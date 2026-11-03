import "server-only";
import type { PostgrestError } from "@supabase/supabase-js";
import type { z } from "zod";
import { getSuperAdmin } from "@/features/auth/guards";
import { dbErrorCode, fail, ok, type ActionResult, type ErrorCode } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

type Db = Awaited<ReturnType<typeof createClient>>;

/**
 * Settings Server Actions: super admin only (checked here and by RLS), zod-validated input,
 * database errors mapped to translated codes. `write` may also return `{ fail: code }` for a rule
 * checked in the action itself.
 */
export async function adminWrite<S extends z.ZodType>(
  schema: S,
  input: unknown,
  write: (data: z.infer<S>, db: Db) => PromiseLike<{ error: PostgrestError | null } | { fail: ErrorCode }>,
  options: { onUnique?: ErrorCode } = {},
): Promise<ActionResult> {
  if (!(await getSuperAdmin())) return fail("forbidden");
  const parsed = schema.safeParse(input);
  if (!parsed.success) return fail("invalidInput");
  const result = await write(parsed.data, await createClient());
  if ("fail" in result) return fail(result.fail);
  return result.error ? fail(dbErrorCode(result.error, options)) : ok(undefined);
}
