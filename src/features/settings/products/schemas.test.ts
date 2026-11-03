import { describe, expect, it } from "vitest";
import { createCategorySchema, thresholdSchema } from "./schemas";

const ID = "a75dbe63-27ca-40ce-be75-108492cfe040";

describe("product schemas", () => {
  it("accepts prices in DH with at most 2 decimals", () => {
    expect(createCategorySchema.safeParse({ typeId: ID, name: " Catégorie F ", salePrice: 2500.5 }).data?.name).toBe("Catégorie F");
    expect(createCategorySchema.safeParse({ typeId: ID, name: "F", salePrice: 10.555 }).success).toBe(false);
    expect(createCategorySchema.safeParse({ typeId: ID, name: "F", salePrice: -1 }).success).toBe(false);
    expect(createCategorySchema.safeParse({ typeId: ID, name: " ", salePrice: 1 }).success).toBe(false);
  });

  it("thresholds are whole numbers or none", () => {
    expect(thresholdSchema.safeParse({ storeId: ID, categoryId: ID, min: 2 }).success).toBe(true);
    expect(thresholdSchema.safeParse({ storeId: ID, categoryId: ID, min: null }).success).toBe(true);
    expect(thresholdSchema.safeParse({ storeId: ID, categoryId: ID, min: 1.5 }).success).toBe(false);
    expect(thresholdSchema.safeParse({ storeId: ID, categoryId: ID, min: -1 }).success).toBe(false);
  });
});
