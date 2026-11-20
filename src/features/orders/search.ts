/**
 * PostgREST `or` filter for the order list search on `order_overview`: client name, phone
 * (4 digits or more) and order number in any form ("832", "00832", "cnt-832", "HIS-B-00394").
 * Returns null when there is nothing to search. Characters that have a meaning in the filter
 * syntax are dropped, and text values are quoted.
 */
export function orderSearchFilter(input: string): string | null {
  const q = input
    .replace(/[,.()"'\\%*_:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!q) return null;

  const parts = [`client_name.ilike."*${q}*"`];
  const digits = q.replace(/\D/g, "").replace(/^0+/, "");
  if (digits.length >= 4) parts.push(`client_phone.ilike."*${digits}*"`);
  if (/\d/.test(q)) {
    parts.push(`display_number.ilike."*${q}*"`);
    const number = q.replace(/\s/g, "").match(/^(?:([a-z]+)-?(?:[a-z]-)?)?0*(\d{1,9})$/i);
    if (number) {
      const [, prefix, slip] = number;
      parts.push(prefix ? `and(store_prefix.ilike.${prefix},slip_number.eq.${Number(slip)})` : `slip_number.eq.${Number(slip)}`);
    }
  }
  return parts.join(",");
}
