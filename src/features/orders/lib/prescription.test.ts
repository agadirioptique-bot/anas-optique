import { describe, expect, it } from "vitest";
import { normalizeEye, prescriptionLine, validatePrescription } from "./prescription";

describe("prescription", () => {
  it("validates ranges, steps and the axis rule", () => {
    expect(validatePrescription({ sph: -1.25, cyl: -0.5, axis: 90, add: 2 })).toEqual({});
    expect(validatePrescription({ sph: -1.3, cyl: null, axis: null, add: null })).toEqual({ sph: "step" });
    expect(validatePrescription({ sph: 25, cyl: null, axis: null, add: null })).toEqual({ sph: "sphRange" });
    expect(validatePrescription({ sph: null, cyl: -0.75, axis: null, add: null })).toEqual({ axis: "axisRequired" });
    expect(validatePrescription({ sph: null, cyl: null, axis: null, add: 5 })).toEqual({ add: "addRange" });
  });

  it("drops an axis without cylinder, as the database requires", () => {
    expect(normalizeEye({ sph: -1, cyl: null, axis: 90, add: null })).toEqual({ sph: -1, cyl: null, axis: null, add: null });
    expect(normalizeEye({ sph: -1, cyl: 0, axis: 90, add: null })).toEqual({ sph: -1, cyl: null, axis: null, add: null });
    expect(normalizeEye({ sph: -1, cyl: -0.5, axis: 90, add: null }).axis).toBe(90);
  });

  it("writes the optician line", () => {
    expect(prescriptionLine({ sph: -1.25, cyl: -0.5, axis: 90, add: 2 })).toBe("−1.25 (−0.50 × 90°) Add +2.00");
  });
});
