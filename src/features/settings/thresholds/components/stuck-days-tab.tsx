"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { StatusBadge } from "@/components/shared/badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useSettingsAction } from "../../use-settings-action";
import { setStuckDays } from "../actions";
import { STUCK_STATUSES, type StuckDays } from "../schemas";
import { NumberField } from "./number-field";

export function StuckDaysTab({ days }: { days: StuckDays }) {
  const t = useTranslations("settings.notifications");
  const tc = useTranslations("common");
  const run = useSettingsAction();
  const [values, setValues] = useState(days);
  const [pending, setPending] = useState(false);
  const valid = STUCK_STATUSES.every((s) => values[s] >= 1 && values[s] <= 60);
  const dirty = STUCK_STATUSES.some((s) => values[s] !== days[s]);

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <ul className="divide-y rounded-2xl border">
          {STUCK_STATUSES.map((s) => (
            <li key={s} className="flex flex-wrap items-center gap-3 p-4">
              <Label htmlFor={`stuck-${s}`} className="min-w-40 flex-1">
                <StatusBadge status={s} />
              </Label>
              <span className="text-sm text-muted-foreground">{t("after")}</span>
              <NumberField id={`stuck-${s}`} value={values[s]} onChange={(n) => setValues((v) => ({ ...v, [s]: n }))} className="num w-16 text-center font-semibold" />
              <span className="text-sm text-muted-foreground">{t("days")}</span>
            </li>
          ))}
        </ul>
        {!valid && <p className="text-sm text-destructive">{t("invalid")}</p>}
        <p className="text-sm text-muted-foreground">{t("hint")}</p>
        <div className="flex justify-end">
          <Button
            disabled={!valid || !dirty || pending}
            onClick={async () => {
              setPending(true);
              await run(() => setStuckDays(values), t("saved"));
              setPending(false);
            }}
          >
            {pending && <Loader2 className="animate-spin" />}
            {tc("save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
