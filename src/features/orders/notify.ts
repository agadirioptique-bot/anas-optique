/** The steps at which a secretary tells the optician on WhatsApp (SPEC §8): new order, arrived in store, delivered. */
export type AdminNotifyStep = "confirmed" | "in_store" | "delivered";

export interface AdminNotifyOrder {
  displayNumber: string;
  clientName: string;
  storeName: string;
  total: number;
  /** Paid so far (delivered: the full total). */
  paid: number;
  balance: number;
  /** Discount on the order. */
  discountAmount?: number;
  /** Delivered: what was collected at the delivery itself (0 when it was already paid). */
  paidToday?: number;
}

export const adminNotifyStep = (status: string): AdminNotifyStep | null =>
  status === "confirmed" || status === "in_store" || status === "delivered" ? status : null;

/** The first word of a name ("Salma Bennani" → "Salma"). */
export const firstName = (name: string): string => name.trim().split(/\s+/)[0] || name;

/**
 * Values of the {variables} of an admin message (lib/whatsapp TEMPLATE_VARIABLES).
 * avance = paid before the delivery, so total = avance + paye_aujourdhui on a delivered order.
 */
export function adminMessageVars(order: AdminNotifyOrder, adminName: string, money: (n: number) => string): Record<string, string> {
  const paidToday = order.paidToday ?? 0;
  return {
    admin: firstName(adminName),
    numero: order.displayNumber,
    client: order.clientName,
    magasin: order.storeName,
    total: money(order.total),
    avance: money(order.paid - paidToday),
    paye_aujourdhui: money(paidToday),
    reste: money(order.balance),
    remise: money(order.discountAmount ?? 0),
  };
}

/** Values of the {variables} of the "your glasses are ready" message to the client. */
export function clientMessageVars(
  order: { clientName: string; displayNumber: string; storeName: string; total: number; balance: number },
  money: (n: number) => string,
): Record<string, string> {
  return {
    prenom: firstName(order.clientName),
    client: order.clientName,
    numero: order.displayNumber,
    magasin: order.storeName,
    total: money(order.total),
    reste: money(order.balance),
  };
}
