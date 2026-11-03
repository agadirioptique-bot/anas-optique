import { z } from "zod";

export const PASSWORD_MIN = 8;

/** Trimmed + lower-cased before the format check (zod runs checks in order). */
export const emailField = z.string().trim().toLowerCase().max(254).pipe(z.email());

export const signInSchema = z.object({
  email: emailField,
  password: z.string().min(1).max(128),
});
export type SignInInput = z.infer<typeof signInSchema>;

export const forgotPasswordSchema = z.object({
  email: emailField,
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const setPasswordSchema = z
  .object({
    password: z.string().min(PASSWORD_MIN).max(128),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "mismatch" });
export type SetPasswordInput = z.infer<typeof setPasswordSchema>;

/** Email link types handled by /auth/confirm. */
export const otpTypeSchema = z.enum(["invite", "recovery"]);

/** Where /auth/confirm may send the user after verifying the link (locale-less). No open redirects. */
const CONFIRM_NEXT = ["/set-password"] as const;

export function safeConfirmNext(next: string | null): (typeof CONFIRM_NEXT)[number] {
  return CONFIRM_NEXT.find((p) => p === next) ?? "/set-password";
}
