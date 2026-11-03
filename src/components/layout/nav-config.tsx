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

/** Counters next to nav items (workshop queue, pending charges). Wired to data in later phases. */
export function useNavBadges(): Partial<Record<NavKey, number>> {
  return {};
}
