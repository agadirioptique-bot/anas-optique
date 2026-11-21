import { describe, expect, it } from "vitest";
import en from "../../../../messages/en.json";
import fr from "../../../../messages/fr.json";
import { formatMoney } from "@/lib/format";
import { fillTemplate, whatsappLink } from "@/lib/whatsapp";
import { adminMessageVars, adminNotifyStep, clientMessageVars, type AdminNotifyOrder } from "../notify";

/** The default WhatsApp messages (messages/*.json › whatsappMessages) filled for an example order. */
const money = (n: number) => formatMoney(n, "fr").replace(/ /g, " ");
const order: AdminNotifyOrder = { displayNumber: "MRF-01215", clientName: "Khadija Chraibi", storeName: "Succursale Maârif", total: 2900, paid: 900, balance: 2000 };
const delivered: AdminNotifyOrder = { ...order, paid: 2900, balance: 0, paidToday: 2000, discountAmount: 100 };
const render = (locale: "fr" | "en", step: "confirmed" | "in_store" | "delivered", o: AdminNotifyOrder) =>
  fillTemplate((locale === "fr" ? fr : en).whatsappMessages[step], adminMessageVars(o, "Karim Alaoui", money));

describe("admin WhatsApp messages", () => {
  it("confirmed: number, store, client, total and deposit", () => {
    expect(render("fr", "confirmed", order)).toBe("Bonjour Karim, nouvelle commande MRF-01215 confirmée à Succursale Maârif : Khadija Chraibi, total 2 900 DH, avance 900 DH.");
    expect(render("en", "confirmed", order)).toBe("Hello Karim, new order MRF-01215 confirmed at Succursale Maârif: Khadija Chraibi, total 2 900 DH, deposit 900 DH.");
  });

  it("in store: the balance due", () => {
    expect(render("fr", "in_store", order)).toBe("Bonjour Karim, la commande MRF-01215 (Khadija Chraibi) est arrivée à Succursale Maârif. Reste à payer : 2 000 DH.");
  });

  it("delivered: order total, deposit (paid before) and paid today (at the delivery)", () => {
    expect(render("fr", "delivered", delivered)).toBe(
      "Bonjour Karim, la commande MRF-01215 (Khadija Chraibi) a été livrée à Succursale Maârif. Total de la commande : 2 900 DH · Avance : 900 DH · Payé aujourd'hui : 2 000 DH.",
    );
    expect(render("en", "delivered", delivered)).toBe(
      "Hello Karim, order MRF-01215 (Khadija Chraibi) was delivered at Succursale Maârif. Order total: 2 900 DH · Deposit: 900 DH · Paid today: 2 000 DH.",
    );
    // Already paid before the delivery: nothing today, everything in the deposit.
    expect(render("fr", "delivered", { ...delivered, paidToday: 0 })).toContain("Avance : 2 900 DH · Payé aujourd'hui : 0 DH.");
  });

  it("a text saved in Settings replaces the default, with the same variables", () => {
    expect(fillTemplate("{numero} livrée, remise {remise}, payé aujourd'hui {paye_aujourdhui}", adminMessageVars(delivered, "Karim", money))).toBe(
      "MRF-01215 livrée, remise 100 DH, payé aujourd'hui 2 000 DH",
    );
  });

  it("client message: first name, number, store, balance", () => {
    expect(fillTemplate(fr.whatsappMessages.client_ready, clientMessageVars({ ...order, clientName: "Salma Bennani", balance: 1100 }, money))).toBe(
      "Bonjour Salma, vos lunettes (commande MRF-01215) sont prêtes à la Succursale Maârif. Reste à payer : 1 100 DH. À bientôt !",
    );
  });

  it("opens WhatsApp on the admin's number with the message", () => {
    const href = whatsappLink("+212661234567", render("fr", "in_store", order));
    expect(href.startsWith("https://wa.me/212661234567?text=")).toBe(true);
    expect(decodeURIComponent(href.split("text=")[1])).toContain("MRF-01215");
  });

  it("only confirmed, in-store and delivered orders offer it", () => {
    expect(adminNotifyStep("confirmed")).toBe("confirmed");
    expect(adminNotifyStep("in_store")).toBe("in_store");
    expect(adminNotifyStep("delivered")).toBe("delivered");
    for (const s of ["in_workshop", "prepared", "cancelled"]) expect(adminNotifyStep(s)).toBeNull();
  });
});
