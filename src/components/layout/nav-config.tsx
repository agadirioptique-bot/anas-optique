import {
  Boxes,
  Factory,
  LayoutDashboard,
  ListOrdered,
  type LucideIcon,
  ReceiptText,
  Settings,
  ShoppingCart,
  Users,
} from "lucide-react";
import type { NavKey } from "@/lib/permissions";
import { useShell } from "./shell-context";

export const NAV_ICONS: Record<NavKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  orders: ListOrdered,
  workshop: Factory,
  clients: Users,
  stock: Boxes,
  purchases: ShoppingCart,
  charges: ReceiptText,
  settings: Settings,
};

/** Counters next to nav items: pending charges (phase 9); workshop queue comes with phase 10. */
export function useNavBadges(): Partial<Record<NavKey, number>> {
  return useShell().badges;
}
