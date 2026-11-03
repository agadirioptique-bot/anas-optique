import "server-only";
import type { SessionUser, StoreSummary } from "@/features/auth/types";
import type { AppRole } from "@/lib/permissions";

// Phase 1 only: removed in phase 3 when real stores and users come from Supabase.

export const DEV_STORES: StoreSummary[] = [
  { id: "dev-store-cnt", name: "Succursale Centre", kind: "store", prefix: "CNT" },
  { id: "dev-store-mrf", name: "Succursale Maârif", kind: "store", prefix: "MRF" },
  { id: "dev-lab", name: "Laboratoire", kind: "lab", prefix: "LAB" },
];

export const DEV_USERS: Record<AppRole, SessionUser> = {
  super_admin: {
    id: "dev-super-admin",
    fullName: "Ali Akouhar",
    email: "opticien@example.com",
    role: "super_admin",
    storeId: null,
  },
  secretary: {
    id: "dev-secretary",
    fullName: "Salma Bennani",
    email: "secretaire@example.com",
    role: "secretary",
    storeId: "dev-store-cnt",
  },
};
