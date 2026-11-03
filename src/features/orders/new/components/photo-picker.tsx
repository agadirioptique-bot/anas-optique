"use client";

import { Camera, FileText, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];

/** Prescription photo picked on the phone/PC; uploaded after the order is created (SPEC §11). */
export function PhotoPicker({ file, onChange, required }: { file: File | null; onChange: (f: File | null) => void; required?: boolean }) {
  const t = useTranslations("wizard");
  const [error, setError] = useState<string | null>(null);
  const preview = useMemo(() => (file && file.type.startsWith("image/") ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  return (
    <div className="space-y-2 sm:col-span-2">
      <Label htmlFor="rx-photo">
        {t("photo")}
        {required && <span className="text-destructive">*</span>}
      </Label>
      {file ? (
        <div className="flex items-center gap-3 rounded-xl border p-2">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
            <img src={preview} alt="" className="size-16 rounded-lg object-cover" />
          ) : (
            <span className="grid size-16 place-items-center rounded-lg bg-muted">
              <FileText className="size-6 text-muted-foreground" aria-hidden="true" />
            </span>
          )}
          <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => onChange(null)} aria-label={t("photoRemove")}>
            <X />
          </Button>
        </div>
      ) : (
        <label htmlFor="rx-photo" className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed text-sm text-muted-foreground hover:bg-muted/50">
          <Camera className="size-4" aria-hidden="true" />
          {t("photoPick")}
        </label>
      )}
      <input
        id="rx-photo"
        type="file"
        accept={PHOTO_TYPES.join(",")}
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          const picked = e.target.files?.[0] ?? null;
          e.target.value = "";
          if (!picked) return;
          if (!PHOTO_TYPES.includes(picked.type) || picked.size > PHOTO_MAX_BYTES) {
            setError(t("photoInvalid"));
            return;
          }
          setError(null);
          onChange(picked);
        }}
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : <p className="text-xs text-muted-foreground">{t("photoHint")}</p>}
    </div>
  );
}
