"use client";

import { Minus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Whole-number input with − / + buttons (counts, quantities). */
export function Stepper({
  id,
  value,
  onChange,
  min = 0,
  max = 99999,
  invalid,
}: {
  id: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  invalid?: boolean;
}) {
  const t = useTranslations("common");
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" size="icon" onClick={() => onChange(clamp(value - 1))} disabled={value <= min} aria-label={t("decrease")}>
        <Minus />
      </Button>
      <Input
        id={id}
        inputMode="numeric"
        className="num text-center text-lg font-semibold"
        value={String(value)}
        aria-invalid={invalid}
        onChange={(e) => {
          const n = parseInt(e.target.value.replace(/\D/g, "").slice(0, 5), 10);
          onChange(clamp(Number.isNaN(n) ? 0 : n));
        }}
      />
      <Button type="button" variant="outline" size="icon" onClick={() => onChange(clamp(value + 1))} disabled={value >= max} aria-label={t("increase")}>
        <Plus />
      </Button>
    </div>
  );
}
