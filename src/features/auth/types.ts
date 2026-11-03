import type { AppRole } from "@/lib/permissions";

export interface SessionUser {
  id: string;
  fullName: string;
  email: string;
  role: AppRole;
  /** Required for secretaries, null for super admins. */
  storeId: string | null;
}

export interface StoreSummary {
  id: string;
  name: string;
  kind: "store" | "lab";
  prefix: string;
}
