import { describe, expect, it } from "vitest";
import { orderSearchFilter } from "./search";

describe("orderSearchFilter", () => {
  it("returns null for an empty search", () => {
    expect(orderSearchFilter("")).toBeNull();
    expect(orderSearchFilter("  ,() ")).toBeNull();
  });

  it("searches the client name only for plain text", () => {
    expect(orderSearchFilter("Fatima El")).toBe('client_name.ilike."*Fatima El*"');
  });

  it("finds a slip number in any form", () => {
    expect(orderSearchFilter("832")).toBe('client_name.ilike."*832*",display_number.ilike."*832*",slip_number.eq.832');
    expect(orderSearchFilter("00250")).toContain("slip_number.eq.250");
    expect(orderSearchFilter("cnt-832")).toContain("and(store_prefix.ilike.cnt,slip_number.eq.832)");
    expect(orderSearchFilter("HIS-00250")).toContain("and(store_prefix.ilike.HIS,slip_number.eq.250)");
    expect(orderSearchFilter("HIS-B-00394")).toContain("and(store_prefix.ilike.HIS,slip_number.eq.394)");
  });

  it("searches the phone from 4 digits, without the leading zero", () => {
    expect(orderSearchFilter("06 44 09")).toContain('client_phone.ilike."*64409*"');
    expect(orderSearchFilter("064")).not.toContain("client_phone");
  });

  it("drops characters that would break the filter", () => {
    const filter = orderSearchFilter('a,b(c)"d*e%f');
    expect(filter).toBe('client_name.ilike."*a b c d e f*"');
  });
});
