"use client";

import { Archive, Plus, RotateCcw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { SortableList } from "@/components/shared/sortable-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { reorderRows } from "../../actions";
import { LabelInput } from "../../components/label-input";
import { useOptimisticOrder } from "../../use-optimistic-order";
import { useSettingsAction } from "../../use-settings-action";
import { createChargeLocation, renameChargeLocation, setChargeLocationArchived } from "../actions";
import type { ChargeLocationRow } from "../queries";

export function ChargeLocationsTab({ locations }: { locations: ChargeLocationRow[] }) {
  const t = useTranslations("settings.chargeLocations");
  const tc = useTranslations("common");
  const locale = useLocale();
  const run = useSettingsAction();
  const [newFr, setNewFr] = useState("");
  const [newEn, setNewEn] = useState("");
  const [ordered, reorder] = useOptimisticOrder(locations);
  const name = (l: ChargeLocationRow) => (locale === "en" ? l.labelEn : l.labelFr);

  const add = async () => {
    const labelFr = newFr.trim();
    if (!labelFr) return;
    if (await run(() => createChargeLocation({ labelFr, labelEn: newEn }), t("added", { label: labelFr }))) {
      setNewFr("");
      setNewEn("");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="flex flex-col gap-2 rounded-xl bg-muted/50 p-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <Input value={newFr} onChange={(e) => setNewFr(e.target.value)} placeholder={t("newPlaceholder")} aria-label={t("labelFr")} className="bg-card" maxLength={80} />
          <Input value={newEn} onChange={(e) => setNewEn(e.target.value)} placeholder={t("labelEn")} aria-label={t("labelEn")} className="bg-card" maxLength={80} />
          <Button type="submit" disabled={!newFr.trim()}>
            <Plus />
            {tc("add")}
          </Button>
        </form>
        <SortableList
          items={ordered}
          handleLabel={(l) => t("drag", { label: name(l) })}
          onReorder={(ids) => reorder(ids, () => run(() => reorderRows({ table: "charge_locations", ids }), tc("saved")))}
          renderItem={(l) => (
            <div className={cn("grid gap-2 py-2 md:grid-cols-[1fr_1fr_7rem_8rem] md:items-center", l.isArchived && "opacity-60")}>
              <LabelInput value={l.labelFr} label={`${t("labelFr")} · ${l.labelFr}`} onSave={(v) => run(() => renameChargeLocation({ id: l.id, labelFr: v, labelEn: l.labelEn }), tc("saved"))} />
              <LabelInput value={l.labelEn} label={`${t("labelEn")} · ${l.labelFr}`} onSave={(v) => run(() => renameChargeLocation({ id: l.id, labelFr: l.labelFr, labelEn: v }), tc("saved"))} />
              <span>
                <Badge variant="secondary">{t(`kinds.${l.kind}`)}</Badge>
              </span>
              <div className="flex justify-end">
                {l.kind === "general" ? null : l.isArchived ? (
                  <Button variant="outline" size="sm" onClick={() => run(() => setChargeLocationArchived({ id: l.id, archived: false }), t("restored", { label: name(l) }))}>
                    <RotateCcw />
                    {tc("restore")}
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => run(() => setChargeLocationArchived({ id: l.id, archived: true }), t("archived", { label: name(l) }))}>
                    <Archive />
                    {tc("archive")}
                  </Button>
                )}
              </div>
            </div>
          )}
        />
        <p className="text-xs text-muted-foreground">{t("hint")}</p>
      </CardContent>
    </Card>
  );
}
