import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";
import { fillTemplate, resolveTemplate, TEMPLATE_KEYS, TEMPLATE_VARIABLES, whatsappLink } from "./whatsapp";

describe("whatsapp", () => {
  it("builds a wa.me link from an E.164 phone", () => {
    expect(whatsappLink("+212612345678", "Bonjour Salma")).toBe("https://wa.me/212612345678?text=Bonjour%20Salma");
  });

  it("fills {variables}, leaves unknown ones as typed", () => {
    expect(fillTemplate("Bonjour {prenom}, total {total}. {inconnu}", { prenom: "Salma", total: "1 200 DH" })).toBe("Bonjour Salma, total 1 200 DH. {inconnu}");
    expect(fillTemplate("{a}{a}", { a: "x" })).toBe("xx");
  });

  it("uses the saved text, else the default", () => {
    expect(resolveTemplate("Mon texte", "Défaut")).toBe("Mon texte");
    expect(resolveTemplate("   ", "Défaut")).toBe("Défaut");
    expect(resolveTemplate(undefined, "Défaut")).toBe("Défaut");
  });

  it("every default text only uses the variables its message offers", () => {
    for (const messages of [fr, en]) {
      for (const key of TEMPLATE_KEYS) {
        const used = [...messages.whatsappMessages[key].matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
        expect(used.length).toBeGreaterThan(0);
        for (const v of used) expect(TEMPLATE_VARIABLES[key]).toContain(v);
        for (const v of TEMPLATE_VARIABLES[key]) expect(fr.settings.whatsapp.vars).toHaveProperty(v);
      }
    }
  });

  it("the client message stays in French in both languages (SPEC §8)", () => {
    expect(en.whatsappMessages.client_ready).toBe(fr.whatsappMessages.client_ready);
  });
});
