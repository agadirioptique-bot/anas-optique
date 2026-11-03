"use client";

import { Camera } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface CustomFieldDef {
  key: string;
  labelFr: string;
  labelEn: string;
  fieldType: "text" | "number" | "date" | "select";
  options: { value: string; label_fr: string; label_en: string }[];
  visibility: "hidden" | "optional" | "required";
}

/**
 * One field of the order form driven by Settings › Custom fields (built-in measurement fields
 * and custom ones). Hidden fields render nothing. Used by the settings preview and the order form.
 */
export function CustomFieldInput({
  field,
  value,
  onChange,
  invalid,
}: {
  field: CustomFieldDef;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
}) {
  const t = useTranslations("settings.fields");
  const locale = useLocale();
  if (field.visibility === "hidden") return null;
  const id = `cf-${field.key}`;
  const label = locale === "en" ? field.labelEn : field.labelFr;
  const required = field.visibility === "required";

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}
        {required && (
          <span className="text-destructive" aria-label={t("requiredMark")}>
            *
          </span>
        )}
      </Label>
      {field.key === "prescription_photo" ? (
        <div className="flex h-10 items-center gap-2 rounded-lg border border-dashed px-3 text-sm text-muted-foreground">
          <Camera className="size-4" aria-hidden="true" />
          {t("photoHint")}
        </div>
      ) : field.fieldType === "select" ? (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger id={id} className="w-full" aria-invalid={invalid} aria-required={required}>
            <SelectValue placeholder={t("choose")} />
          </SelectTrigger>
          <SelectContent>
            {field.options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {locale === "en" ? o.label_en : o.label_fr}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          id={id}
          type={field.fieldType === "date" ? "date" : "text"}
          inputMode={field.fieldType === "number" ? "decimal" : undefined}
          className={field.fieldType === "number" ? "num" : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={invalid}
          aria-required={required}
        />
      )}
    </div>
  );
}
