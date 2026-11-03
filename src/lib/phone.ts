/**
 * Phones are stored in E.164 (SPEC §2): "+2126XXXXXXXX", displayed "06 XX XX XX XX".
 * Accepts what people type in Morocco: "06 12 34 56 78", "0612345678", "+212 6 12…", "00212…", "612345678".
 */

const MOROCCO = /^\+212[5-7]\d{8}$/;
const E164 = /^\+[1-9]\d{7,14}$/;

/** E.164 number, or null when the input is not a valid phone. */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  let digits = trimmed.replace(/[\s.\-()/]/g, "");
  if (digits.startsWith("00")) digits = "+" + digits.slice(2);
  if (!digits.startsWith("+")) {
    if (/^0[5-7]\d{8}$/.test(digits)) digits = "+212" + digits.slice(1);
    else if (/^[5-7]\d{8}$/.test(digits)) digits = "+212" + digits;
    else if (/^212[5-7]\d{8}$/.test(digits)) digits = "+" + digits;
    else return null;
  }
  if (digits.startsWith("+212")) return MOROCCO.test(digits) ? digits : null;
  return E164.test(digits) ? digits : null;
}

/** "+212612345678" → "06 12 34 56 78"; other countries are shown as stored. */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  if (!MOROCCO.test(e164)) return e164;
  const local = "0" + e164.slice(4);
  return local.replace(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/, "$1 $2 $3 $4 $5");
}

/** As-you-type grouping for Moroccan numbers: "0612345678" → "06 12 34 56 78". International input is left alone. */
export function formatPhoneTyping(raw: string): string {
  if (raw.trim().startsWith("+") || raw.trim().startsWith("00")) return raw;
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  return digits.replace(/(\d{2})(?=\d)/g, "$1 ");
}
