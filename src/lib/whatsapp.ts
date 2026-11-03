import { formatMoney } from "./format";

/** wa.me link for an E.164 phone ("+212612345678" → https://wa.me/212612345678?text=…). */
export function whatsappLink(e164: string, text: string): string {
  return `https://wa.me/${e164.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}

/** French "your glasses are ready" message (SPEC §8: WhatsApp message link in FR). */
export function readyMessage({ clientName, displayNumber, storeName, balance }: { clientName: string; displayNumber: string; storeName: string; balance: number }): string {
  const first = clientName.trim().split(/\s+/)[0] ?? clientName;
  const due = balance > 0 ? ` Reste à payer : ${formatMoney(balance, "fr")}.` : "";
  return `Bonjour ${first}, vos lunettes (commande ${displayNumber}) sont prêtes à la ${storeName}.${due} À bientôt !`;
}
