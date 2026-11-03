import { z } from "zod";
import { ORDER_STATUSES } from "@/lib/orders";

const uuid = z.uuid();
const money = z.number().positive().max(10_000_000).multipleOf(0.01);

export const changeStatusSchema = z.object({ orderId: uuid, to: z.enum(ORDER_STATUSES).exclude(["cancelled"]) });
export const paymentSchema = z.object({ orderId: uuid, amount: money, methodId: uuid });
export const deliverSchema = z.object({ orderId: uuid, payment: z.object({ amount: money, methodId: uuid }).nullable() });
export const cancelSchema = z
  .object({
    orderId: uuid,
    reasonId: uuid,
    note: z.string().trim().max(300).optional(),
    refundAmount: z.number().min(0).max(10_000_000).multipleOf(0.01),
    refundMethodId: uuid.nullable(),
  })
  .refine((v) => v.refundAmount === 0 || !!v.refundMethodId, { path: ["refundMethodId"], message: "method" });
export const freeDiscountSchema = z.object({ orderId: uuid, amount: money });

export const ORDER_VIEWS = ["board", "list"] as const;
export const ORDER_PERIODS = ["any", "7", "30", "90", "365"] as const;

export const orderListFiltersSchema = z.object({
  view: z.enum(ORDER_VIEWS).catch("board"),
  status: z.enum([...ORDER_STATUSES, "all"]).catch("all"),
  period: z.enum(ORDER_PERIODS).catch("any"),
});
export type OrderListFilters = z.infer<typeof orderListFiltersSchema>;
