import { z } from "zod";
import { emailField } from "@/features/auth/schemas";
import { ROLES } from "@/lib/permissions";

const role = z.enum(ROLES);
const storeId = z.uuid().nullable();

/** A secretary needs a store; a super admin never has one (the database also enforces both). */
function storeMatchesRole<T extends { role: (typeof ROLES)[number]; storeId: string | null }>(v: T) {
  return v.role === "super_admin" || v.storeId !== null;
}

export const inviteUserSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    email: emailField,
    role,
    storeId,
  })
  .refine(storeMatchesRole, { path: ["storeId"], message: "store_required" })
  .transform((v) => ({ ...v, storeId: v.role === "super_admin" ? null : v.storeId }));
export type InviteUserInput = z.input<typeof inviteUserSchema>;

export const updateUserAccessSchema = z
  .object({
    userId: z.uuid(),
    role,
    storeId,
    isActive: z.boolean(),
  })
  .refine(storeMatchesRole, { path: ["storeId"], message: "store_required" })
  .transform((v) => ({ ...v, storeId: v.role === "super_admin" ? null : v.storeId }));
export type UpdateUserAccessInput = z.input<typeof updateUserAccessSchema>;

export const resendInviteSchema = z.object({ userId: z.uuid() });
