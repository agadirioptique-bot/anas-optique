"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Loader2, MailCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";
import { requestPasswordReset } from "../actions";
import { fieldAria, FormAlert, FormField } from "./form-field";

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const te = useTranslations("errors");
  const [sentTo, setSentTo] = useState<string | null>(null);

  const schema = useMemo(
    () =>
      z.object({
        email: z
          .string()
          .trim()
          .min(1, { message: t("emailRequired") })
          .pipe(z.email({ message: t("emailInvalid") })),
      }),
    [t],
  );
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "" } });

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await requestPasswordReset(values);
    if (!result.ok) {
      form.setError("root", { message: te(result.error) });
      return;
    }
    setSentTo(values.email);
  });

  const back = (
    <Link href="/login" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
      <ArrowLeft className="size-4" aria-hidden="true" />
      {t("backToLogin")}
    </Link>
  );

  if (sentTo) {
    return (
      <div className="space-y-6" role="status">
        <div className="flex gap-3 rounded-2xl border bg-card p-4 shadow-soft">
          <MailCheck className="size-6 shrink-0 text-success-text" aria-hidden="true" />
          <p className="text-sm">{t("forgotSent", { email: sentTo })}</p>
        </div>
        {back}
      </div>
    );
  }

  const { errors, isSubmitting } = form.formState;
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <FormField id="email" label={t("email")} error={errors.email?.message}>
        <Input
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder={t("emailPlaceholder")}
          {...fieldAria("email", errors.email?.message)}
          {...form.register("email")}
        />
      </FormField>
      {errors.root && <FormAlert>{errors.root.message}</FormAlert>}
      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="animate-spin" />}
        {t("forgotSubmit")}
      </Button>
      <div className="pt-2">{back}</div>
    </form>
  );
}
