import { describe, expect, it } from "vitest";
import { readyMessage, whatsappLink } from "./whatsapp";

describe("whatsapp", () => {
  it("builds a wa.me link from an E.164 phone", () => {
    expect(whatsappLink("+212612345678", "Bonjour Salma")).toBe("https://wa.me/212612345678?text=Bonjour%20Salma");
  });

  it("writes the ready message in French with the balance when due", () => {
    expect(readyMessage({ clientName: "Salma Bennani", displayNumber: "CNT-00832", storeName: "Succursale Centre", balance: 1100 })).toBe(
      "Bonjour Salma, vos lunettes (commande CNT-00832) sont prêtes à la Succursale Centre. Reste à payer : 1 100 DH. À bientôt !",
    );
    expect(readyMessage({ clientName: "Salma", displayNumber: "CNT-00833", storeName: "Succursale Centre", balance: 0 })).not.toContain("Reste");
  });
});
