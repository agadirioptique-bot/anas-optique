/** The two steps at which a secretary tells the optician on WhatsApp (SPEC §8). */
export type AdminNotifyStep = "confirmed" | "in_store";

export interface AdminNotifyOrder {
  displayNumber: string;
  clientName: string;
  storeName: string;
  total: number;
  paid: number;
  balance: number;
}

export const adminNotifyStep = (status: string): AdminNotifyStep | null =>
  status === "confirmed" || status === "in_store" ? status : null;
