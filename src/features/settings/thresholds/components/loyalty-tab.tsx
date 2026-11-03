"use client";

import { Loader2, Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useSettingsAction } from "../../use-settings-action";
import { setLoyaltyThreshold } from "../actions";
import type { LoyaltyData } from "../queries";
import { NumberField } from "./number-field";

export function LoyaltyTab({ data }: { data: LoyaltyData }) {
  const t = useTranslations("settings.loyalty");
  const tc = useTranslations("common");
  const run = useSettingsAction();
  const [orders, setOrders] = useState(data.threshold);
  const [pending, setPending] = useState(false);
  const valid = orders >= 1 && orders <= 100;
  const reaching = data.distribution.filter((d) => d.delivered >= orders).reduce((s, d) => s + d.clients, 0);

  const save = async () => {
    setPending(true);
    await run(async () => {
      const result = await setLoyaltyThreshold({ orders });
      if (result.ok) toast.success(result.data.newlyLoyal > 0 ? t("savedNewLoyal", { count: result.data.newlyLoyal }) : t("saved"));
      return result;
    });
    setPending(false);
  };

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="loy-orders" className="flex items-center gap-2">
            <Star className="size-4 text-amber-500" aria-hidden="true" />
            {t("threshold")}
          </Label>
          <div className="flex items-center gap-2">
            <NumberField id="loy-orders" value={orders} onChange={setOrders} />
            <span className="text-sm text-muted-foreground">{t("deliveredOrders")}</span>
          </div>
          {!valid && <p className="text-sm text-destructive">{t("invalid")}</p>}
        </div>
        <div className="space-y-1 rounded-2xl bg-muted/50 p-4 text-sm" aria-live="polite">
          <p>{t("loyalNow", { count: data.loyalClients })}</p>
          {valid && <p className="text-muted-foreground">{t("preview", { count: reaching, orders })}</p>}
          {valid && orders < data.threshold && <p className="font-medium">{t("lowerHint")}</p>}
        </div>
        <div className="flex justify-end">
          <Button disabled={!valid || orders === data.threshold || pending} onClick={save}>
            {pending && <Loader2 className="animate-spin" />}
            {tc("save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
