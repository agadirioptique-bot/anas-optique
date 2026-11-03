"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { ROLES } from "@/lib/permissions";
import { DEV_ROLE_COOKIE, DEV_SIGNED_OUT, isDevFakeAuth } from "./flags";

// Phase 1 only: removed in phase 3.

const roleSchema = z.enum([...ROLES, DEV_SIGNED_OUT]);

export async function setDevRole(input: unknown): Promise<{ ok: boolean }> {
  if (!isDevFakeAuth()) return { ok: false };
  const parsed = roleSchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  (await cookies()).set(DEV_ROLE_COOKIE, parsed.data, { path: "/", sameSite: "lax", httpOnly: true });
  return { ok: true };
}
