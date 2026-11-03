"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { SessionUser, StoreSummary } from "@/features/auth/types";

export interface ShellValue {
  user: SessionUser;
  /** Stores and lab visible to the user (secretary: only hers). */
  stores: StoreSummary[];
  /** Super admin selector value: "all" or a store/lab id. */
  activeStore: string;
}

const ShellContext = createContext<ShellValue | null>(null);

export function ShellProvider({ value, children }: { value: ShellValue; children: ReactNode }) {
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell(): ShellValue {
  const value = useContext(ShellContext);
  if (!value) throw new Error("useShell must be used inside <ShellProvider>");
  return value;
}
