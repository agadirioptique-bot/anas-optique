"use client";

import { Input } from "@/components/ui/input";

/** Small whole-number field (thresholds, days). Empty → 0, so the save button can flag it. */
export function NumberField({ id, value, onChange, className }: { id: string; value: number; onChange: (n: number) => void; className?: string }) {
  return (
    <Input
      id={id}
      inputMode="numeric"
      className={className ?? "num w-20 text-center text-lg font-semibold"}
      value={value || ""}
      onChange={(e) => {
        const n = parseInt(e.target.value.replace(/\D/g, "").slice(0, 3), 10);
        onChange(Number.isNaN(n) ? 0 : n);
      }}
    />
  );
}
