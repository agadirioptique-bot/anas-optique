import { describe, expect, it } from "vitest";
import { buildOptions, createFieldSchema, slugifyKey, uniqueKey } from "./schemas";

describe("custom field keys", () => {
  it("are lower-case ascii, start with a letter", () => {
    expect(slugifyKey("Écart pupillaire (mm)")).toBe("ecart_pupillaire_mm");
    expect(slugifyKey("  Œil dominant ")).toBe("oeil_dominant");
    expect(slugifyKey("2e paire")).toBe("f_2e_paire");
    expect(slugifyKey("!!!")).toBe("field");
    expect(slugifyKey("x".repeat(80))).toHaveLength(40);
  });

  it("never reuse a taken key", () => {
    expect(uniqueKey("ep_re", ["ep_re", "ep_re_2"])).toBe("ep_re_3");
    expect(uniqueKey("remarque", [])).toBe("remarque");
  });
});

describe("select options", () => {
  it("pair FR and EN lines, English falls back to French", () => {
    expect(buildOptions(["Droit", "Gauche", "Droit"], ["Right"])).toEqual([
      { value: "droit", label_fr: "Droit", label_en: "Right" },
      { value: "gauche", label_fr: "Gauche", label_en: "Gauche" },
      { value: "droit_2", label_fr: "Droit", label_en: "Droit" },
    ]);
  });

  it("a select needs at least two options", () => {
    expect(createFieldSchema.safeParse({ labelFr: "Œil", fieldType: "select", optionsFr: ["Droit"] }).success).toBe(false);
    expect(createFieldSchema.safeParse({ labelFr: "Remarque", fieldType: "text" }).success).toBe(true);
  });
});
