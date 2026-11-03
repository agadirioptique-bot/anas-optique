"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Inline rename: saves on blur / Enter, Escape cancels (demo settings lists). */
export function LabelInput({
  value,
  onSave,
  label,
  className,
  required = true,
}: {
  value: string;
  onSave: (v: string) => void;
  label: string;
  className?: string;
  required?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    setDraft(value);
  }
  return (
    <Input
      value={draft}
      aria-label={label}
      className={cn("h-9 pointer-coarse:h-10", className)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const next = draft.trim();
        if ((next || !required) && next !== value) onSave(next);
        else setDraft(value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}
