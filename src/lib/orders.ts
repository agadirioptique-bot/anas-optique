import type { Database } from "@/types/database";

export type OrderStatus = Database["public"]["Enums"]["order_status"];

/** Workflow order (SPEC §5.3); `cancelled` is outside the flow. */
export const ORDER_FLOW = ["confirmed", "in_workshop", "prepared", "in_store", "delivered"] as const satisfies readonly OrderStatus[];
export const ORDER_STATUSES = [...ORDER_FLOW, "cancelled"] as const satisfies readonly OrderStatus[];
