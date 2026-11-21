import { describe, expect, it } from "vitest";
import { whatsappTemplatesSchema } from "./schemas";

const all = { confirmed: "", in_store: "", delivered: "Livrée {numero}", client_ready: "" };

describe("WhatsApp templates schema", () => {
  it("accepts the 4 texts (empty = default) and trims them", () => {
    const parsed = whatsappTemplatesSchema.parse({ ...all, delivered: "  Livrée {numero}  " });
    expect(parsed.delivered).toBe("Livrée {numero}");
    expect(parsed.confirmed).toBe("");
  });

  it("rejects a missing text and a text over 1 000 characters", () => {
    expect(whatsappTemplatesSchema.safeParse({ confirmed: "", in_store: "", delivered: "" }).success).toBe(false);
    expect(whatsappTemplatesSchema.safeParse({ ...all, delivered: "x".repeat(1001) }).success).toBe(false);
  });
});
