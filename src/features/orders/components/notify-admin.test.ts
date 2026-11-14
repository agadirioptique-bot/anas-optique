import { IntlMessageFormat } from "intl-messageformat";
import { describe, expect, it } from "vitest";
import en from "../../../../messages/en.json";
import fr from "../../../../messages/fr.json";
import { whatsappLink } from "@/lib/whatsapp";
import { adminNotifyStep } from "../notify";

/** The WhatsApp messages a secretary sends the optician (messages/*.json › notifyAdmin.messages). */
const render = (locale: "fr" | "en", step: "confirmed" | "in_store", hasBalance: boolean) =>
  new IntlMessageFormat((locale === "fr" ? fr : en).notifyAdmin.messages[step], locale).format({
    admin: "Karim",
    number: "MRF-01215",
    client: "Khadija Chraibi",
    store: "Succursale Maârif",
    total: "2 900 DH",
    paid: "900 DH",
    balance: hasBalance ? "2 000 DH" : "0 DH",
    hasBalance: hasBalance ? "yes" : "no",
  }) as string;

describe("admin WhatsApp messages", () => {
  it("confirmed: number, store, client, total and deposit", () => {
    expect(render("fr", "confirmed", true)).toBe("Bonjour Karim, nouvelle commande MRF-01215 confirmée à Succursale Maârif : Khadija Chraibi, total 2 900 DH, acompte 900 DH.");
    expect(render("en", "confirmed", true)).toBe("Hello Karim, new order MRF-01215 confirmed at Succursale Maârif: Khadija Chraibi, total 2 900 DH, deposit 900 DH.");
  });

  it("in store: the balance only when something is still due", () => {
    expect(render("fr", "in_store", true)).toBe("Bonjour Karim, la commande MRF-01215 (Khadija Chraibi) est arrivée à Succursale Maârif. Reste à payer : 2 000 DH.");
    expect(render("fr", "in_store", false)).toBe("Bonjour Karim, la commande MRF-01215 (Khadija Chraibi) est arrivée à Succursale Maârif.");
    expect(render("en", "in_store", false)).toBe("Hello Karim, order MRF-01215 (Khadija Chraibi) has arrived at Succursale Maârif.");
  });

  it("opens WhatsApp on the admin's number with the message", () => {
    const href = whatsappLink("+212661234567", render("fr", "in_store", false));
    expect(href.startsWith("https://wa.me/212661234567?text=")).toBe(true);
    expect(decodeURIComponent(href.split("text=")[1])).toContain("MRF-01215");
  });

  it("only confirmed and in-store orders offer it", () => {
    expect(adminNotifyStep("confirmed")).toBe("confirmed");
    expect(adminNotifyStep("in_store")).toBe("in_store");
    for (const s of ["in_workshop", "prepared", "delivered", "cancelled"]) expect(adminNotifyStep(s)).toBeNull();
  });
});
