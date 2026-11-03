import { formatAxis, formatDiopter } from "@/lib/format";

/** One eye on the paper slip. od = right eye (RE), og = left eye (LE). */
export interface EyePrescription {
  sph: number | null;
  cyl: number | null;
  axis: number | null;
  add: number | null;
}
export type RxField = keyof EyePrescription;
export type Eye = "od" | "og";

export const RX_FIELDS: RxField[] = ["sph", "cyl", "axis", "add"];
export const EMPTY_EYE: EyePrescription = { sph: null, cyl: null, axis: null, add: null };

/** Input limits (the database accepts −30…+30 in 0.25 steps; the form is stricter). */
export const LIMITS: Record<RxField, { min: number; max: number; step: number }> = {
  sph: { min: -20, max: 20, step: 0.25 },
  cyl: { min: -10, max: 10, step: 0.25 },
  axis: { min: 0, max: 180, step: 5 },
  add: { min: 0.25, max: 4, step: 0.25 },
};

export type RxError = "sphRange" | "cylRange" | "addRange" | "axisRange" | "axisRequired" | "step";

/** Translation keys (rx.errors.*) per field. */
export function validatePrescription(rx: EyePrescription): Partial<Record<RxField, RxError>> {
  const errors: Partial<Record<RxField, RxError>> = {};
  const quarter = (n: number) => Math.abs(n * 4 - Math.round(n * 4)) < 1e-6;
  if (rx.sph !== null) {
    if (rx.sph < -20 || rx.sph > 20) errors.sph = "sphRange";
    else if (!quarter(rx.sph)) errors.sph = "step";
  }
  if (rx.cyl !== null) {
    if (rx.cyl < -10 || rx.cyl > 10) errors.cyl = "cylRange";
    else if (!quarter(rx.cyl)) errors.cyl = "step";
  }
  if (rx.add !== null) {
    if (rx.add < 0.25 || rx.add > 4) errors.add = "addRange";
    else if (!quarter(rx.add)) errors.add = "step";
  }
  if (rx.axis !== null && (rx.axis < 0 || rx.axis > 180 || !Number.isInteger(rx.axis))) errors.axis = "axisRange";
  if (rx.cyl && rx.axis === null) errors.axis = "axisRequired";
  return errors;
}

/** The database stores an axis only with a cylinder (orders_re_axis / orders_le_axis). */
export function normalizeEye(rx: EyePrescription): EyePrescription {
  return rx.cyl ? rx : { ...rx, cyl: rx.cyl === 0 ? null : rx.cyl, axis: null };
}

/** One line: "−1.25 (−0.50 × 90°) Add +2.00" */
export function prescriptionLine(rx: EyePrescription): string {
  const parts = [formatDiopter(rx.sph)];
  if (rx.cyl) parts.push(`(${formatDiopter(rx.cyl)} × ${formatAxis(rx.axis)})`);
  if (rx.add) parts.push(`Add ${formatDiopter(rx.add)}`);
  return parts.join(" ");
}

/** Database columns (re_* / le_*) ↔ the two eyes. */
export function eyesFromRow(row: {
  re_sph: number | null; re_cyl: number | null; re_axis: number | null; re_add: number | null;
  le_sph: number | null; le_cyl: number | null; le_axis: number | null; le_add: number | null;
}): { od: EyePrescription; og: EyePrescription } {
  return {
    od: { sph: row.re_sph, cyl: row.re_cyl, axis: row.re_axis, add: row.re_add },
    og: { sph: row.le_sph, cyl: row.le_cyl, axis: row.le_axis, add: row.le_add },
  };
}
