"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { PasswordInput } from "@/components/shared/password-input";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { setPassword } from "../actions";
import { PASSWORD_MIN } from "../schemas";
import { fieldAria, FormAlert, FormField } from "./form-field";

export function SetPasswordForm({ email }: { email: string }) {
  const t = useTranslations("auth");
  const te = useTranslations("errors");
  const router = useRouter();

  const schema = useMemo(
    () =>
      z
        .object({
          password: z.string().min(PASSWORD_MIN, { message: t("passwordTooShort", { min: PASSWORD_MIN }) }),
          confirm: z.string(),
        })
        .refine((v) => v.password === v.confirm, { path: ["confirm"], message: t("passwordMismatch") }),
    [t],
  );
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { password: "", confirm: "" } });

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await setPassword(values);
    if (!result.ok) {
      form.setError("root", { message: te(result.error) });
      return;
    }
    router.replace(result.data.home);
    router.refresh();
  });

  const { errors, isSubmitting } = form.formState;
  const hint = t("passwordHint", { min: PASSWORD_MIN });
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {/* Lets password managers save the new password against the right account. */}
      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
      <FormField id="password" label={t("newPassword")} error={errors.password?.message} hint={hint}>
        <PasswordInput autoComplete="new-password" {...fieldAria("password", errors.password?.message, hint)} {...form.register("password")} />
      </FormField>
      <FormField id="confirm" label={t("confirmPassword")} error={errors.confirm?.message}>
        <PasswordInput autoComplete="new-password" {...fieldAria("confirm", errors.confirm?.message)} {...form.register("confirm")} />
      </FormField>
      {errors.root && <FormAlert>{errors.root.message}</FormAlert>}
      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="animate-spin" />}
        {t("setPasswordSubmit")}
      </Button>
    </form>
  );
}
