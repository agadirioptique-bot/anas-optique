"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { PasswordInput } from "@/components/shared/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link, useRouter } from "@/i18n/navigation";
import type { ErrorCode } from "@/lib/errors";
import { signIn } from "../actions";
import { fieldAria, FormAlert, FormField } from "./form-field";

export function LoginForm({ initialError }: { initialError?: ErrorCode }) {
  const t = useTranslations("auth");
  const te = useTranslations("errors");
  const router = useRouter();

  const schema = useMemo(
    () =>
      z.object({
        email: z
          .string()
          .trim()
          .min(1, { message: t("emailRequired") })
          .pipe(z.email({ message: t("emailInvalid") })),
        password: z.string().min(1, { message: t("passwordRequired") }),
      }),
    [t],
  );
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await signIn(values);
    if (!result.ok) {
      form.setError("root", { message: te(result.error) });
      return;
    }
    router.replace(result.data.home);
    router.refresh();
  });

  const { errors, isSubmitting } = form.formState;
  const rootError = errors.root?.message ?? (initialError ? te(initialError) : undefined);

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
      <FormField id="password" label={t("password")} error={errors.password?.message}>
        <PasswordInput autoComplete="current-password" {...fieldAria("password", errors.password?.message)} {...form.register("password")} />
      </FormField>
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-sm font-medium text-primary hover:underline">
          {t("forgotLink")}
        </Link>
      </div>
      {rootError && <FormAlert>{rootError}</FormAlert>}
      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="animate-spin" />}
        {t("submit")}
      </Button>
    </form>
  );
}
