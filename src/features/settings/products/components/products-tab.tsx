"use client";

import { Archive, Glasses, Info, Plus, RotateCcw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { ChoiceChips } from "@/components/shared/choice-chips";
import { ConfirmDialog } from "@/components/shared/dialogs";
import { MoneyInput } from "@/components/shared/money-input";
import { EmptyState } from "@/components/shared/page";
import { SortableList } from "@/components/shared/sortable-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { reorderRows } from "../../actions";
import { LabelInput } from "../../components/label-input";
import { useOptimisticOrder } from "../../use-optimistic-order";
import { useSettingsAction } from "../../use-settings-action";
import { createCategory, renameProductType, setCategoryArchived, setProductTypeArchived, setThreshold, updateCategory } from "../actions";
import type { CategoryRow, ProductsData, ProductTypeRow } from "../queries";

function typeLabel(type: ProductTypeRow, locale: string) {
  return locale === "en" ? type.labelEn : type.labelFr;
}

function TypesCard({ types }: { types: ProductTypeRow[] }) {
  const t = useTranslations("settings.products");
  const tc = useTranslations("common");
  const run = useSettingsAction();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("typesTitle")}</CardTitle>
        <CardDescription>{t("typesDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y rounded-2xl border">
          {types.map((type) => (
            <li key={type.id} className={cn("grid gap-2 p-3 md:grid-cols-[1fr_1fr_8rem_6rem] md:items-center", type.isArchived && "rounded-lg bg-muted/60")}>
              <LabelInput
                value={type.labelFr}
                label={`${t("labelFr")} · ${type.labelFr}`}
                onSave={(v) => run(() => renameProductType({ id: type.id, labelFr: v, labelEn: type.labelEn }), t("saved"))}
              />
              <LabelInput
                value={type.labelEn}
                label={`${t("labelEn")} · ${type.labelFr}`}
                onSave={(v) => run(() => renameProductType({ id: type.id, labelFr: type.labelFr, labelEn: v }), t("saved"))}
              />
              <span>
                {type.isFrame && (
                  <Badge variant="secondary" className="gap-1">
                    <Glasses className="size-3.5" aria-hidden="true" />
                    {t("frameType")}
                  </Badge>
                )}
              </span>
              <label className="flex items-center gap-2 text-sm md:justify-end">
                <span className="md:sr-only">{tc("active")}</span>
                <Switch
                  checked={!type.isArchived}
                  aria-label={`${tc("active")} · ${type.labelFr}`}
                  onCheckedChange={(v) => run(() => setProductTypeArchived({ id: type.id, archived: !v }), t("saved"))}
                />
              </label>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function CategoryLine({ category, onArchive }: { category: CategoryRow; onArchive: () => void }) {
  const t = useTranslations("settings.products");
  const tc = useTranslations("common");
  const run = useSettingsAction();
  const [price, setPrice] = useState<number | undefined>(category.salePrice);
  const [synced, setSynced] = useState(category.salePrice);
  if (category.salePrice !== synced) {
    setSynced(category.salePrice);
    setPrice(category.salePrice);
  }
  const savePrice = () => {
    if (price === undefined || price === category.salePrice) return setPrice(category.salePrice);
    void run(() => updateCategory({ id: category.id, name: category.name, salePrice: Math.round(price * 100) / 100 }), t("priceSaved", { name: category.name }));
  };
  return (
    <div className={cn("grid gap-2 py-2 sm:grid-cols-[1fr_10rem_8rem] sm:items-center", category.isArchived && "rounded-lg bg-muted/60")}>
      <LabelInput
        value={category.name}
        label={`${t("categoryName")} · ${category.name}`}
        onSave={(v) => run(() => updateCategory({ id: category.id, name: v, salePrice: category.salePrice }), t("saved"))}
      />
      <MoneyInput value={price} onChange={setPrice} onBlur={savePrice} aria-label={`${t("salePrice")} · ${category.name}`} className="h-9" />
      <div className="flex justify-end">
        {category.isArchived ? (
          <Button variant="outline" size="sm" onClick={() => run(() => setCategoryArchived({ id: category.id, archived: false }), t("restored", { name: category.name }))}>
            <RotateCcw />
            {tc("restore")}
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={onArchive}>
            <Archive />
            {tc("archive")}
          </Button>
        )}
      </div>
    </div>
  );
}

function CategoriesCard({ types, categories }: { types: ProductTypeRow[]; categories: CategoryRow[] }) {
  const t = useTranslations("settings.products");
  const tc = useTranslations("common");
  const locale = useLocale();
  const run = useSettingsAction();
  const activeTypes = types.filter((ty) => !ty.isArchived);
  const [typeId, setTypeId] = useState(activeTypes[0]?.id ?? types[0]?.id ?? "");
  const [showArchived, setShowArchived] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState<number | undefined>(undefined);
  const [archiving, setArchiving] = useState<CategoryRow | null>(null);
  const [ordered, reorder] = useOptimisticOrder(categories.filter((c) => c.typeId === typeId && (showArchived || !c.isArchived)));

  const add = async () => {
    if (!name.trim() || price === undefined) return;
    if (await run(() => createCategory({ typeId, name, salePrice: Math.round(price * 100) / 100 }), t("added", { name: name.trim() }))) {
      setName("");
      setPrice(undefined);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("categoriesTitle")}</CardTitle>
        <CardDescription className="flex items-start gap-2">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {t("categoriesDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <ChoiceChips
            label={t("typesTitle")}
            value={typeId}
            onChange={setTypeId}
            options={types.map((ty) => ({ value: ty.id, label: typeLabel(ty, locale) }))}
          />
          <label className="flex items-center gap-2 text-sm sm:ml-auto">
            <Switch checked={showArchived} onCheckedChange={setShowArchived} />
            {t("showArchived")}
          </label>
        </div>

        <form
          className="grid gap-2 rounded-xl bg-muted/50 p-3 sm:grid-cols-[1fr_10rem_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("newCategory")} aria-label={t("categoryName")} className="bg-card" maxLength={60} />
          <MoneyInput value={price} onChange={setPrice} aria-label={t("salePrice")} />
          <Button type="submit" disabled={!name.trim() || price === undefined}>
            <Plus />
            {tc("add")}
          </Button>
        </form>

        {ordered.length === 0 ? (
          <EmptyState illustration="box" title={t("emptyCategories")} className="py-8" />
        ) : (
          <SortableList
            items={ordered}
            handleLabel={(c) => t("drag", { name: c.name })}
            onReorder={(ids) => reorder(ids, () => run(() => reorderRows({ table: "product_categories", ids }), t("reordered")))}
            renderItem={(c) => <CategoryLine category={c} onArchive={() => setArchiving(c)} />}
          />
        )}
      </CardContent>
      <ConfirmDialog
        open={!!archiving}
        onOpenChange={(o) => !o && setArchiving(null)}
        destructive={false}
        title={t("archiveTitle", { name: archiving?.name ?? "" })}
        description={t("archiveBody")}
        confirmLabel={tc("archive")}
        onConfirm={async () => {
          if (archiving) await run(() => setCategoryArchived({ id: archiving.id, archived: true }), t("archived", { name: archiving.name }));
        }}
      />
    </Card>
  );
}

function ThresholdCell({ storeId, category, value, storeName }: { storeId: string; category: CategoryRow; value: number | undefined; storeName: string }) {
  const t = useTranslations("settings.products");
  const run = useSettingsAction();
  const initial = value === undefined ? "" : String(value);
  const [text, setText] = useState(initial);
  const [synced, setSynced] = useState(initial);
  if (initial !== synced) {
    setSynced(initial);
    setText(initial);
  }
  return (
    <Input
      inputMode="numeric"
      value={text}
      placeholder="—"
      aria-label={t("thresholdFor", { category: category.name, store: storeName })}
      className="num h-9 w-16 text-center"
      onChange={(e) => setText(e.target.value.replace(/\D/g, "").slice(0, 4))}
      onBlur={() => {
        if (text === initial) return;
        const min = text === "" ? null : Number(text);
        void run(() => setThreshold({ storeId, categoryId: category.id, min }), t("thresholdSaved"));
      }}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}

function ThresholdsCard({ data }: { data: ProductsData }) {
  const t = useTranslations("settings.products");
  const tc = useTranslations("common");
  const locale = useLocale();
  const types = new Map(data.types.map((ty) => [ty.id, ty]));
  const categories = data.categories.filter((c) => !c.isArchived && !types.get(c.typeId)?.isArchived);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("thresholdsTitle")}</CardTitle>
        <CardDescription>{t("thresholdsDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        {categories.length === 0 || data.locations.length === 0 ? (
          <EmptyState illustration="box" title={t("emptyCategories")} className="py-8" />
        ) : (
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("categoryName")}</TableHead>
                  {data.locations.map((l) => (
                    <TableHead key={l.id} className="text-center whitespace-nowrap">
                      {l.name}
                      {l.kind === "lab" && <span className="block text-xs font-normal">{tc("lab")}</span>}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium whitespace-nowrap">
                      {c.name}
                      <span className="block text-xs font-normal text-muted-foreground">{typeLabel(types.get(c.typeId)!, locale)}</span>
                    </TableCell>
                    {data.locations.map((l) => (
                      <TableCell key={l.id} className="text-center">
                        <div className="flex justify-center">
                          <ThresholdCell storeId={l.id} storeName={l.name} category={c} value={data.thresholds[`${l.id}:${c.id}`]} />
                        </div>
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ProductsTab({ data }: { data: ProductsData }) {
  return (
    <div className="space-y-6">
      <CategoriesCard types={data.types} categories={data.categories} />
      <ThresholdsCard data={data} />
      <TypesCard types={data.types} />
    </div>
  );
}
