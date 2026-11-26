"use client";

import { Archive, Info, Lock, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { StatusBadge } from "@/components/shared/badges";
import { ConfirmDialog } from "@/components/shared/dialogs";
import { EmptyState } from "@/components/shared/page";
import { SortableList } from "@/components/shared/sortable-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ORDER_STATUSES } from "@/lib/orders";
import { cn } from "@/lib/utils";
import { reorderRows } from "../../actions";
import { LabelInput } from "../../components/label-input";
import { useOptimisticOrder } from "../../use-optimistic-order";
import { useSettingsAction } from "../../use-settings-action";
import { createListItem, deleteListItem, renameListItem, setListItemArchived } from "../actions";
import type { ListItemRow } from "../queries";
import { LIST_KEYS, type ListKey } from "../schemas";

export function ListsTab({ items }: { items: ListItemRow[] }) {
  const t = useTranslations("settings.lists");
  const tc = useTranslations("common");
  const locale = useLocale();
  const run = useSettingsAction();
  const [listKey, setListKey] = useState<ListKey>("lens_types");
  const [showArchived, setShowArchived] = useState(false);
  const [newFr, setNewFr] = useState("");
  const [newEn, setNewEn] = useState("");
  const [confirm, setConfirm] = useState<{ item: ListItemRow; kind: "archive" | "delete" } | null>(null);

  const inList = items.filter((i) => i.listKey === listKey);
  const [ordered, reorder] = useOptimisticOrder(inList.filter((i) => showArchived || !i.isArchived));
  const archivedCount = inList.filter((i) => i.isArchived).length;
  const name = (i: ListItemRow) => (locale === "en" ? i.labelEn : i.labelFr);

  const add = async () => {
    const labelFr = newFr.trim();
    if (!labelFr) return;
    if (await run(() => createListItem({ listKey, labelFr, labelEn: newEn }), t("added", { label: labelFr }))) {
      setNewFr("");
      setNewEn("");
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Select value={listKey} onValueChange={(v) => setListKey(v as ListKey)}>
              <SelectTrigger className="w-full sm:w-72" aria-label={t("title")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LIST_KEYS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {t(`names.${k}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2 text-sm sm:ml-auto">
              <Switch checked={showArchived} onCheckedChange={setShowArchived} />
              {t("showArchived")}
              {archivedCount > 0 && <Badge variant="secondary">{archivedCount}</Badge>}
            </label>
          </div>

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

          <div className="hidden grid-cols-[2.75rem_1fr_1fr_11rem_8rem] gap-2 px-1 text-xs font-medium text-muted-foreground md:grid">
            <span />
            <span>{t("labelFr")}</span>
            <span>{t("labelEn")}</span>
            <span />
            <span />
          </div>
          {ordered.length === 0 ? (
            <EmptyState illustration="box" title={t("empty")} className="py-8" />
          ) : (
            <SortableList
              items={ordered}
              handleLabel={(i) => t("drag", { label: name(i) })}
              onReorder={(ids) => reorder(ids, () => run(() => reorderRows({ table: "settings_list_items", ids }), t("reordered")))}
              renderItem={(i) => (
                <div className={cn("grid grid-cols-1 gap-2 py-2 md:grid-cols-[1fr_1fr_11rem_8rem] md:items-center", i.isArchived && "rounded-lg bg-muted/60")}>
                  <LabelInput value={i.labelFr} label={`${t("labelFr")} · ${i.labelFr}`} onSave={(v) => run(() => renameListItem({ id: i.id, labelFr: v, labelEn: i.labelEn }), t("renamed", { label: v }))} />
                  <LabelInput value={i.labelEn} label={`${t("labelEn")} · ${i.labelFr}`} onSave={(v) => run(() => renameListItem({ id: i.id, labelFr: i.labelFr, labelEn: v }), t("renamed", { label: v }))} />
                  <span className="num flex items-center gap-1.5 text-xs text-muted-foreground">
                    {i.code && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Lock className="size-3.5" aria-label={t("system")} />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-64">{t("systemHint")}</TooltipContent>
                      </Tooltip>
                    )}
                    {t("usage", { count: i.uses })}
                  </span>
                  <div className="flex justify-end">
                    {i.isArchived ? (
                      <Button variant="outline" size="sm" onClick={() => run(() => setListItemArchived({ id: i.id, archived: false }), t("restored", { label: name(i) }))}>
                        <RotateCcw />
                        {tc("restore")}
                      </Button>
                    ) : i.uses > 0 || i.code ? (
                      <Button variant="outline" size="sm" onClick={() => setConfirm({ item: i, kind: "archive" })}>
                        <Archive />
                        {tc("archive")}
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirm({ item: i, kind: "delete" })}>
                        <Trash2 />
                        {tc("delete")}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="size-4 text-muted-foreground" aria-hidden="true" />
            {t("fixedTitle")}
          </CardTitle>
          <CardDescription className="flex items-start gap-2">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {t("fixedBody")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label>{t("statuses")}</Label>
          <div className="flex flex-wrap gap-2">
            {ORDER_STATUSES.map((s) => (
              <StatusBadge key={s} status={s} />
            ))}
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        destructive={confirm?.kind === "delete"}
        title={confirm ? t(confirm.kind === "archive" ? "archiveTitle" : "deleteTitle", { label: name(confirm.item) }) : ""}
        description={confirm?.kind === "archive" ? t("archiveBody") : t("deleteBody")}
        confirmLabel={confirm?.kind === "archive" ? tc("archive") : tc("delete")}
        onConfirm={async () => {
          if (!confirm) return;
          const { item, kind } = confirm;
          if (kind === "archive") await run(() => setListItemArchived({ id: item.id, archived: true }), t("archived", { label: name(item) }));
          else await run(() => deleteListItem({ id: item.id }), t("deleted", { label: name(item) }));
        }}
      />
    </div>
  );
}
