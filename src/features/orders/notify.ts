/** The steps at which a secretary tells the optician on WhatsApp (SPEC §8): new order, arrived in store, delivered. */
export type AdminNotifyStep = "confirmed" | "in_store" | "delivered";

export interface AdminNotifyOrder {
  displayNumber: string;
  clientName: string;
  storeName: string;
  total: number;
  paid: number;
  balance: number;
  /** Discount on the order (shown in the "delivered" message when > 0). */
  discountAmount?: number;
}

export const adminNotifyStep = (status: string): AdminNotifyStep | null =>
  status === "confirmed" || status === "in_store" || status === "delivered" ? status : null;
