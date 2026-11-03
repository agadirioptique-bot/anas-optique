"use client";

import { Loader2, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { ChoiceChips } from "@/components/shared/choice-chips";
import { CustomFieldInput } from "@/components/shared/custom-field-input";
import { ConfirmDialog, ResponsiveDialog } from "@/components/shared/dialogs";
import { EmptyState } from "@/components/shared/page";
import { SortableList } from "@/components/shared/sortable-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { reorderRows } from "../../actions";
import { useOptimisticOrder } from "../../use-optimistic-order";
import { useSettingsAction } from "../../use-settings-action";
import { createCustomField, deleteCustomField, setFieldVisibility, updateCustomField } from "../actions";
import type { FieldRow, FieldsData } from "../queries";
import { FIELD_TYPES, VISIBILITIES, type FieldType, type Visibility } from "../schemas";

const lines = (s: string) =>
  s
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);

function FieldDialog({ field, onClose }: { field?: FieldRow; onClose: () => void }) {
  const t = useTranslations("settings.fields");
  const tc = useTranslations("common");
  const run = useSettingsAction();
  const [labelFr, setLabelFr] = useState(field?.labelFr ?? "");
  const [labelEn, setLabelEn] = useState(field?.labelEn ?? "");
  const [fieldType, setFieldType] = useState<FieldType>(field?.fieldType ?? "text");
  const [optionsFr, setOptionsFr] = useState((field?.options ?? []).map((o) => o.label_fr).join("\n"));
  const [optionsEn, setOptionsEn] = useState((field?.options ?? []).map((o) => o.label_en).join("\n"));
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const builtin = !!field?.isBuiltin;
  const showOptions = fieldType === "select" && !builtin;
  const optionsOk = !showOptions || lines(optionsFr).length >= 2;

  const save = async () => {
    setTouched(true);
    if (!labelFr.trim() || !optionsOk) return;
    setPending(true);
    const input = { labelFr, labelEn, optionsFr: lines(optionsFr), optionsEn: lines(optionsEn) };
    const done = field
      ? await run(() => updateCustomField({ id: field.id, ...input }), t("saved", { label: labelFr.trim() }))
      : await run(() => createCustomField({ ...input, fieldType }), t("saved", { label: labelFr.trim() }));
    setPending(false);
    if (done) onClose();
  };

  return (
    <ResponsiveDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={field ? t("editTitle") : t("createTitle")}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {tc("save")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="cf-fr">{t("labelFr")}</Label>
            <Input id="cf-fr" value={labelFr} maxLength={80} onChange={(e) => setLabelFr(e.target.value)} aria-invalid={touched && !labelFr.trim()} placeholder={t("labelPlaceholder")} />
            {touched && !labelFr.trim() && <p className="text-sm text-destructive">{t("labelRequired")}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="cf-en">{t("labelEn")}</Label>
            <Input id="cf-en" value={labelEn} maxLength={80} onChange={(e) => setLabelEn(e.target.value)} />
          </div>
        </div>
        <div className="space-y-2">
          <Label>{t("type")}</Label>
          {field ? (
            <p className="text-sm">
              <Badge variant="secondary">{t(`types.${field.fieldType}`)}</Badge>
              <span className="ml-2 text-muted-foreground">{t("typeLocked")}</span>
            </p>
          ) : (
            <ChoiceChips label={t("type")} value={fieldType} onChange={(v) => setFieldType(v as FieldType)} options={FIELD_TYPES.map((ty) => ({ value: ty, label: t(`types.${ty}`) }))} />
          )}
        </div>
        {showOptions && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cf-ofr">{t("optionsFr")}</Label>
              <Textarea id="cf-ofr" rows={4} value={optionsFr} onChange={(e) => setOptionsFr(e.target.value)} aria-invalid={touched && !optionsOk} />
              {touched && !optionsOk && <p className="text-sm text-destructive">{t("optionsRequired")}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="cf-oen">{t("optionsEn")}</Label>
              <Textarea id="cf-oen" rows={4} value={optionsEn} onChange={(e) => setOptionsEn(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground sm:col-span-2">{t("optionsHint")}</p>
          </div>
        )}
      </div>
    </ResponsiveDialog>
  );
}

export function FieldsTab({ data }: { data: FieldsData }) {
  const t = useTranslations("settings.fields");
  const tc = useTranslations("common");
  const locale = useLocale();
  const run = useSettingsAction();
  const [editing, setEditing] = useState<FieldRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<FieldRow | null>(null);
  const [preview, setPreview] = useState<Record<string, string>>({});
  const [ordered, reorder] = useOptimisticOrder(data.fields);
  const name = (f: FieldRow) => (locale === "en" ? f.labelEn : f.labelFr);
  const withOptions = (f: FieldRow) => (f.key === "vision_type" ? { ...f, options: data.visionTypes } : f);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={() => setEditing("new")}>
            <Plus />
            {t("add")}
          </Button>
          {ordered.length === 0 ? (
            <EmptyState illustration="orders" title={t("empty")} className="py-8" />
          ) : (
            <SortableList
              items={ordered}
              handleLabel={(f) => t("drag", { label: name(f) })}
              onReorder={(ids) => reorder(ids, () => run(() => reorderRows({ table: "custom_fields", ids }), tc("saved")))}
              renderItem={(f) => (
                <div className={cn("flex flex-wrap items-center gap-3 py-2.5", f.visibility === "hidden" && "opacity-60")}>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate font-medium">
                      {f.isBuiltin && <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-label={t("builtin")} />}
                      {name(f)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <Badge variant="secondary" className="mr-2">
                        {f.isBuiltin ? t("builtin") : t(`types.${f.fieldType}`)}
                      </Badge>
                      {!f.isBuiltin && t("used", { count: f.orders })}
                    </p>
                  </div>
                  <Select value={f.visibility} onValueChange={(v) => run(() => setFieldVisibility({ id: f.id, visibility: v }), t("visibilitySaved", { label: name(f) }))}>
                    <SelectTrigger className="h-9 w-36" aria-label={`${t("visibility")} · ${name(f)}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VISIBILITIES.map((v: Visibility) => (
                        <SelectItem key={v} value={v}>
                          {t(`visibilities.${v}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="icon-sm" onClick={() => setEditing(f)} aria-label={`${t("editTitle")} · ${name(f)}`}>
                    <Pencil />
                  </Button>
                  {!f.isBuiltin && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <Button variant="ghost" size="icon-sm" disabled={f.orders > 0} onClick={() => setDeleting(f)} aria-label={`${tc("delete")} · ${name(f)}`}>
                            <Trash2 />
                          </Button>
                        </span>
                      </TooltipTrigger>
                      {f.orders > 0 && <TooltipContent>{t("cannotDelete")}</TooltipContent>}
                    </Tooltip>
                  )}
                </div>
              )}
            />
          )}
        </CardContent>
      </Card>

      <Card className="self-start">
        <CardHeader>
          <CardTitle>{t("preview")}</CardTitle>
          <CardDescription>{t("previewHint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {ordered.every((f) => f.visibility === "hidden") ? (
            <p className="text-sm text-muted-foreground">{t("previewEmpty")}</p>
          ) : (
            ordered.map((f) => (
              <CustomFieldInput key={f.id} field={withOptions(f)} value={preview[f.key] ?? ""} onChange={(v) => setPreview((p) => ({ ...p, [f.key]: v }))} />
            ))
          )}
        </CardContent>
      </Card>

      {editing && <FieldDialog key={editing === "new" ? "new" : editing.id} field={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t("deleteTitle", { label: deleting ? name(deleting) : "" })}
        description={t("deleteBody")}
        confirmLabel={tc("delete")}
        onConfirm={async () => {
          if (deleting) await run(() => deleteCustomField({ id: deleting.id }), t("deleted"));
        }}
      />
    </div>
  );
}
