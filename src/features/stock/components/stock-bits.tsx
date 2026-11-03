"use client";

import { Minus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setThreshold } from "@/features/settings/products/actions";
import { useSettingsAction } from "@/features/settings/use-settings-action";
import { cn } from "@/lib/utils";
import { stockState, type StockState } from "../state";

const PILL: Record<StockState, string> = {
  none: "bg-muted text-foreground",
  ok: "bg-muted text-foreground",
  atMin: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  below: "bg-destructive/10 text-destructive",
};

/** Red below the threshold, amber at it, neutral otherwise (DESIGN §3). */
export function QuantityPill({ qty, min, className }: { qty: number; min: number | null; className?: string }) {
  const t = useTranslations("stock.states");
  const state = stockState(qty, min);
  return (
    <span
      className={cn("num inline-flex h-7 min-w-10 items-center justify-center rounded-lg px-2 font-bold", PILL[state], className)}
      title={t(state)}
    >
      {qty}
      <span className="sr-only"> ({t(state)})</span>
    </span>
  );
}

/** "+3" / "−2" with a real minus sign. */
export function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0";
}

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
  const t = useTranslations("stock.adjust");
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

/** Super admin: click the threshold to edit it in place; empty = no alert. Others: read only. */
export function ThresholdCell({
  storeId,
  categoryId,
  categoryName,
  value,
  editable,
}: {
  storeId: string;
  categoryId: string;
  categoryName: string;
  value: number | null;
  editable: boolean;
}) {
  const t = useTranslations("stock.threshold");
  const run = useSettingsAction();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  if (!editable) return <span className="num text-muted-foreground">{value ?? "—"}</span>;
  if (!editing) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setText(value === null ? "" : String(value));
          setEditing(true);
        }}
        className="num min-w-10 rounded-md border border-dashed border-transparent px-2 py-1 text-muted-foreground hover:border-border hover:text-foreground pointer-coarse:min-h-10"
        aria-label={t("edit", { category: categoryName })}
        title={t("hint")}
      >
        {value ?? "—"}
      </button>
    );
  }
  const save = () => {
    setEditing(false);
    const min = text === "" ? null : Math.min(9999, parseInt(text, 10));
    if (min === value) return;
    void run(() => setThreshold({ storeId, categoryId, min }), min === null ? t("cleared") : t("saved", { min }));
  };
  return (
    <Input
      autoFocus
      inputMode="numeric"
      className="num mx-auto h-8 w-16 text-center pointer-coarse:h-10"
      value={text}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setText(e.target.value.replace(/\D/g, "").slice(0, 4))}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") save();
        if (e.key === "Escape") setEditing(false);
      }}
      aria-label={t("edit", { category: categoryName })}
    />
  );
}
