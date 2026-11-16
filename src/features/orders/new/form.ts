import { z } from "zod";
import { EMPTY_EYE, normalizeEye, RX_FIELDS, validatePrescription, type EyePrescription } from "@/features/orders/lib/prescription";
import { normalizePhone } from "@/lib/phone";
import type { NewOrderData } from "./data";
import type { CreateOrderPayload } from "./schemas";

const eye = z.object({ sph: z.number().nullable(), cyl: z.number().nullable(), axis: z.number().nullable(), add: z.number().nullable() });

export type PendingDiscount = { type: "percent" | "amount"; value: number };

export interface OrderFormValues {
  storeId: string;
  slipNumber?: number;
  booklet: string;
  /** Set by the live "already used" check of step 1. */
  slipTaken: boolean;
  clientMode: "existing" | "new";
  clientId?: string;
  newClient: { fullName: string; phone: string; hasWhatsapp: boolean };
  /** The chosen client's pre-approved discount (step 1). */
  pendingDiscount: PendingDiscount | null;
  applyDiscount: boolean;
  od: EyePrescription;
  og: EyePrescription;
  /** Built-in measurement fields and custom fields, by key. */
  fieldValues: Record<string, string>;
  ownFrame: boolean;
  frameCategoryId?: string;
  /** Contact lenses / accessories: categoryId → quantity. */
  items: Record<string, number>;
  lensTypeId?: string;
  treatmentIds: string[];
  lensDetails: string;
  total?: number;
  deposit?: number;
  paymentMethodId: string;
}

export const STEPS = ["client", "measures", "products"] as const;

export const STEP_FIELDS = [
  ["storeId", "slipNumber", "booklet", "clientId", "newClient.fullName", "newClient.phone"],
  ["od", "og", "fieldValues"],
  ["frameCategoryId", "items", "total", "deposit", "paymentMethodId"],
] as const;

const RX_PATHS = (["od", "og"] as const).flatMap((eye) => RX_FIELDS.map((f) => `${eye}.${f}`));

/**
 * Paths to validate before leaving a step, always down to the leaves ("od.axis", "fieldValues.distance").
 * react-hook-form's trigger() drops the error of an object path that has no registered input ("od",
 * "fieldValues") while still reporting the step as invalid: the step would refuse to move on and show
 * no message.
 */
export function stepFields(step: number, data: Pick<NewOrderData, "fields">): string[] {
  if (step === 1) return [...RX_PATHS, ...data.fields.map((f) => `fieldValues.${f.key}`)];
  return [...(STEP_FIELDS[step] ?? [])];
}

export function defaultValues(data: NewOrderData): OrderFormValues {
  return {
    storeId: data.defaultStoreId,
    slipNumber: undefined,
    booklet: "",
    slipTaken: false,
    clientMode: "existing",
    clientId: data.prefillClient?.id,
    newClient: { fullName: "", phone: "", hasWhatsapp: true },
    pendingDiscount: data.prefillClient?.pendingDiscount ? { type: data.prefillClient.pendingDiscount.type, value: data.prefillClient.pendingDiscount.value } : null,
    applyDiscount: !!data.prefillClient?.pendingDiscount,
    od: { ...EMPTY_EYE },
    og: { ...EMPTY_EYE },
    fieldValues: {},
    ownFrame: false,
    frameCategoryId: undefined,
    items: {},
    lensTypeId: undefined,
    treatmentIds: [],
    lensDetails: "",
    total: undefined,
    deposit: undefined,
    paymentMethodId: data.paymentMethods[0]?.id ?? "",
  };
}

/** Sale price of everything chosen (frame + items): the total can't be lower (SPEC §6). */
export function itemsPrice(v: { ownFrame: boolean; frameCategoryId?: string; items: Record<string, number> }, data: Pick<NewOrderData, "categories">): number {
  const price = new Map(data.categories.map((c) => [c.id, c.salePrice]));
  let sum = !v.ownFrame && v.frameCategoryId ? (price.get(v.frameCategoryId) ?? 0) : 0;
  for (const [id, qty] of Object.entries(v.items)) if (qty > 0) sum += (price.get(id) ?? 0) * qty;
  return Math.round(sum * 100) / 100;
}

/** Discount the client's pre-approved discount gives on this total (same rule as create_order). */
export function discountAmount(total: number | undefined, pending: PendingDiscount | null | undefined, apply: boolean): number {
  if (!apply || !pending || total === undefined) return 0;
  const d = pending;
  return d.type === "percent" ? Math.round(total * d.value) / 100 : d.value;
}

type Translate = (key: string, values?: Record<string, string | number>) => string;

export function buildOrderSchema(t: Translate, ctx: { data: NewOrderData }) {
  return z
    .object({
      storeId: z.string().min(1),
      slipNumber: z.number().optional(),
      booklet: z.string(),
      slipTaken: z.boolean(),
      clientMode: z.enum(["existing", "new"]),
      clientId: z.string().optional(),
      newClient: z.object({ fullName: z.string(), phone: z.string(), hasWhatsapp: z.boolean() }),
      pendingDiscount: z.object({ type: z.enum(["percent", "amount"]), value: z.number() }).nullable(),
      applyDiscount: z.boolean(),
      od: eye,
      og: eye,
      fieldValues: z.record(z.string(), z.string()),
      ownFrame: z.boolean(),
      frameCategoryId: z.string().optional(),
      items: z.record(z.string(), z.number()),
      lensTypeId: z.string().optional(),
      treatmentIds: z.array(z.string()),
      lensDetails: z.string(),
      total: z.number().optional(),
      deposit: z.number().optional(),
      paymentMethodId: z.string(),
    })
    .superRefine((v, c) => {
      const issue = (path: (string | number)[], message: string) => c.addIssue({ code: "custom", path, message });
      // Step 1 — slip + client
      if (!v.slipNumber || v.slipNumber <= 0 || !Number.isInteger(v.slipNumber)) issue(["slipNumber"], t("wizard.slipRequired"));
      else if (v.slipTaken) issue(["slipNumber"], t("errors.duplicateSlip"));
      if (v.clientMode === "existing" && !v.clientId) issue(["clientId"], t("wizard.chooseClient"));
      if (v.clientMode === "new") {
        if (v.newClient.fullName.trim().length < 2) issue(["newClient", "fullName"], t("clients.nameRequired"));
        if (!normalizePhone(v.newClient.phone)) issue(["newClient", "phone"], t("clients.phoneInvalid"));
      }
      // Step 2 — measurements
      for (const side of ["od", "og"] as const) {
        for (const [field, code] of Object.entries(validatePrescription(v[side]))) issue([side, field], t(`rx.errors.${code}`));
      }
      for (const f of ctx.data.fields) {
        if (f.visibility === "required" && f.key !== "prescription_photo" && !v.fieldValues[f.key]?.trim()) {
          issue(["fieldValues", f.key], t("wizard.fieldRequired"));
        }
        const raw = v.fieldValues[f.key]?.trim();
        if (raw && f.fieldType === "number" && !Number.isFinite(Number(raw.replace(",", ".")))) issue(["fieldValues", f.key], t("wizard.numberInvalid"));
      }
      // Step 3 — products & payment
      const hasItems = Object.values(v.items).some((q) => q > 0);
      if (!v.ownFrame && !v.frameCategoryId && !hasItems) issue(["frameCategoryId"], t("wizard.frameRequired"));
      const minimum = itemsPrice(v, ctx.data);
      if (v.total === undefined) issue(["total"], t("wizard.totalRequired"));
      else if (v.total < minimum) issue(["total"], t("wizard.totalBelowItems", { amount: minimum }));
      const net = (v.total ?? 0) - discountAmount(v.total, v.pendingDiscount, v.clientMode === "existing" && v.applyDiscount);
      if (v.applyDiscount && v.total !== undefined && net < minimum) issue(["total"], t("errors.discountTooHigh"));
      if (v.deposit !== undefined && v.deposit < 0) issue(["deposit"], t("wizard.depositNegative"));
      if (v.deposit !== undefined && v.total !== undefined && v.deposit > net) issue(["deposit"], t("wizard.depositTooHigh"));
      if ((v.deposit ?? 0) > 0 && !v.paymentMethodId) issue(["paymentMethodId"], t("wizard.methodRequired"));
    });
}

const BUILTIN_NUMBER = ["ep_re", "ep_le", "fitting_height"] as const;
const BUILTIN_COLUMNS = new Set<string>([...BUILTIN_NUMBER, "vision_type", "doctor_name", "prescription_date", "prescription_photo"]);

function toNumber(raw: string | undefined): number | null {
  const s = raw?.trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Form values → create_order payload (validated again by createOrderPayloadSchema and the database). */
export function toPayload(v: OrderFormValues, data: NewOrderData): CreateOrderPayload {
  const od = normalizeEye(v.od);
  const og = normalizeEye(v.og);
  const fields = new Map(data.fields.map((f) => [f.key, f]));
  const custom: Record<string, string | number> = {};
  for (const [key, raw] of Object.entries(v.fieldValues)) {
    const value = raw.trim();
    const field = fields.get(key);
    if (!value || !field || BUILTIN_COLUMNS.has(key) || field.visibility === "hidden") continue;
    custom[key] = field.fieldType === "number" ? (toNumber(value) ?? value) : value;
  }
  const shown = (key: string) => fields.get(key)?.visibility !== "hidden";
  const text = (key: string) => (shown(key) && v.fieldValues[key]?.trim()) || null;
  const items = Object.entries(v.items)
    .filter(([, qty]) => qty > 0)
    .map(([category_id, qty]) => ({ category_id, qty }));
  if (!v.ownFrame && v.frameCategoryId) items.unshift({ category_id: v.frameCategoryId, qty: 1 });
  const deposit = v.deposit ?? 0;

  return {
    store_id: v.storeId,
    booklet: v.booklet.trim().toUpperCase(),
    slip_number: v.slipNumber ?? 0,
    ...(v.clientMode === "existing"
      ? { client_id: v.clientId }
      : { new_client: { full_name: v.newClient.fullName.trim(), phone_e164: normalizePhone(v.newClient.phone) ?? "", has_whatsapp: v.newClient.hasWhatsapp } }),
    re_sph: od.sph, re_cyl: od.cyl, re_axis: od.axis, re_add: od.add,
    le_sph: og.sph, le_cyl: og.cyl, le_axis: og.axis, le_add: og.add,
    ep_re: shown("ep_re") ? toNumber(v.fieldValues.ep_re) : null,
    ep_le: shown("ep_le") ? toNumber(v.fieldValues.ep_le) : null,
    fitting_height: shown("fitting_height") ? toNumber(v.fieldValues.fitting_height) : null,
    vision_type_id: text("vision_type"),
    doctor_name: text("doctor_name"),
    prescription_date: text("prescription_date"),
    custom_values: custom,
    lens_type_id: v.lensTypeId ?? null,
    lens_details: v.lensDetails.trim() || null,
    treatment_ids: v.treatmentIds,
    items,
    client_own_frame: v.ownFrame,
    subtotal: Math.round((v.total ?? 0) * 100) / 100,
    apply_client_discount: v.clientMode === "existing" && v.applyDiscount,
    deposit: { amount: Math.round(deposit * 100) / 100, method_id: deposit > 0 ? v.paymentMethodId : null },
  };
}

/** "CNT-00832" / "CNT-B-00001" (same rule as format_order_number in the database). */
export function displayNumber(prefix: string, booklet: string, slip: number | undefined, digits: number): string {
  if (!slip) return `${prefix}-${booklet ? `${booklet}-` : ""}${"·".repeat(digits)}`;
  const s = String(slip);
  return `${prefix}-${booklet ? `${booklet}-` : ""}${s.length >= digits ? s : s.padStart(digits, "0")}`;
}
