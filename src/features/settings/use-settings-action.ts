"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/lib/errors";

/** Runs a settings Server Action: toast on success/failure, then refreshes the server data. */
export function useSettingsAction() {
  const te = useTranslations("errors");
  const router = useRouter();
  return useCallback(
    async <T,>(action: () => Promise<ActionResult<T>>, success?: string): Promise<boolean> => {
      const result = await action();
      if (!result.ok) {
        toast.error(te(result.error));
        router.refresh();
        return false;
      }
      if (success) toast.success(success);
      router.refresh();
      return true;
    },
    [te, router],
  );
}
