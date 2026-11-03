import { z } from "zod";

const money = z.number().finite().min(0).max(9_999_999_999.99);
const positiveMoney = money.refine((n) => n > 0);

/**
 * A business date that isn't in the future. One day of slack: the server's clock zone (and its
 * time-zone data, SPEC §11 phase 7) may be a day behind the user's calendar around midnight.
 */
const pastDate = z.iso.date().refine((d) => d <= new Date(Date.now() + 86_400_000).toISOString().slice(0, 10), { message: "future" });

const stockLine = z.object({ kind: z.literal("stock"), categoryId: z.uuid(), unitPrice: money, qty: z.number().int().positive().max(9999) });
const lensLine = z.object({ kind: z.literal("lens"), description: z.string().trim().min(1).max(200), amount: money });

/** New purchase = goods received (create_purchase), with an optional first payment. */
export const purchaseSchema = z
  .object({
    supplierId: z.uuid(),
    receiveStoreId: z.uuid(),
    purchaseDate: pastDate,
    supplierRef: z.string().trim().max(60).optional(),
    note: z.string().trim().max(500).optional(),
    lines: z.array(z.discriminatedUnion("kind", [stockLine, lensLine])).min(1).max(100),
    payment: z.object({ amount: positiveMoney, methodId: z.uuid(), paidAt: pastDate }).optional(),
  })
  .refine(
    (d) => {
      const ids = d.lines.flatMap((l) => (l.kind === "stock" ? [l.categoryId] : []));
      return new Set(ids).size === ids.length;
    },
    { path: ["lines"] },
  );

/** Supplier payment (add_supplier_payment): ≤ remaining is checked by the database. */
export const paymentSchema = z.object({
  purchaseId: z.uuid(),
  amount: positiveMoney,
  paidAt: pastDate,
  methodId: z.uuid(),
  note: z.string().trim().max(500).optional(),
});

export const supplierSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40).optional(),
  note: z.string().trim().max(500).optional(),
});

export const supplierArchiveSchema = z.object({ id: z.uuid(), archived: z.boolean() });
export const supplierIdSchema = z.object({ id: z.uuid() });

/** `?tab=` on the Purchasing page. */
export const purchasesSearchSchema = z.object({ tab: z.enum(["purchases", "suppliers"]).catch("purchases").default("purchases") });

export type PurchaseInput = z.input<typeof purchaseSchema>;
