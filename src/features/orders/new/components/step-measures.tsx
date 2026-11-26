"use client";

import { ArrowDownToLine, Copy, History } from "lucide-react";
import { useTranslations } from "next-intl";
import { useFormContext, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { CustomFieldInput } from "@/components/shared/custom-field-input";
import { Button } from "@/components/ui/button";
import { PrescriptionEditor } from "@/features/orders/components/prescription";
import type { Eye, RxField } from "@/features/orders/lib/prescription";
import { useFormat } from "@/lib/use-format";
import type { OrderFormValues } from "../form";
import { useNewOrder } from "./context";
import { PhotoPicker } from "./photo-picker";

export function StepMeasures() {
  const t = useTranslations();
  const f = useFormat();
  const { data, client, photo, setPhoto } = useNewOrder();
  const form = useFormContext<OrderFormValues>();
  const od = useWatch({ control: form.control, name: "od" });
  const og = useWatch({ control: form.control, name: "og" });
  const mode = useWatch({ control: form.control, name: "clientMode" });
  const fieldValues = useWatch({ control: form.control, name: "fieldValues" });
  const { errors } = form.formState;
  const lastRx = mode === "existing" ? client?.lastRx : null;
  const fields = data.fields.filter((fd) => fd.visibility !== "hidden");

  const setEye = (eye: Eye, rx: OrderFormValues["od"]) => form.setValue(eye, rx, { shouldValidate: form.formState.isSubmitted });

  const rxErrors: Partial<Record<Eye, Partial<Record<RxField, string>>>> = {};
  for (const eye of ["od", "og"] as const) {
    const e = errors[eye];
    if (e) rxErrors[eye] = { sph: e.sph?.message, cyl: e.cyl?.message, axis: e.axis?.message, add: e.add?.message };
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setEye("og", { ...od });
            toast.success(t("rx.copied"));
          }}
        >
          <Copy />
          {t("rx.copyOdToOg")}
        </Button>
        {lastRx && (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setEye("od", { ...lastRx.od });
              setEye("og", { ...lastRx.og });
              toast.success(t("rx.reused"));
            }}
          >
            <History />
            <span className="flex flex-col items-start leading-tight">
              <span>{t("rx.reuseLast")}</span>
              <span className="text-xs font-normal text-muted-foreground">{t("rx.reuseLastHint", { date: f.date(lastRx.at) })}</span>
            </span>
          </Button>
        )}
      </div>

      <PrescriptionEditor value={{ od, og }} onChange={setEye} errors={rxErrors} />

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <ArrowDownToLine className="size-3.5" aria-hidden="true" />
        {t("wizard.measuresHint")}
      </p>

      {fields.length > 0 && (
        <div className="space-y-3 border-t pt-5">
          <h3 className="text-sm font-semibold">{t("wizard.customFields")}</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {fields.map((field) =>
              field.key === "prescription_photo" ? (
                <PhotoPicker key={field.id} file={photo} onChange={setPhoto} required={field.visibility === "required"} />
              ) : (
                <div key={field.id} className="space-y-1">
                  <CustomFieldInput
                    field={field}
                    value={fieldValues[field.key] ?? ""}
                    invalid={!!errors.fieldValues?.[field.key]}
                    onChange={(v) => form.setValue("fieldValues", { ...fieldValues, [field.key]: v }, { shouldValidate: form.formState.isSubmitted })}
                  />
                  {errors.fieldValues?.[field.key] && <p className="text-sm text-destructive">{errors.fieldValues[field.key]?.message}</p>}
                </div>
              ),
            )}
          </div>
        </div>
      )}
    </div>
  );
}
