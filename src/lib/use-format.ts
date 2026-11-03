import { useFormatter, useLocale, useNow } from "next-intl";
import { formatMoney } from "./format";

/** Locale-aware display helpers. Dates use the app time zone (Africa/Casablanca, i18n/request.ts). */
export function useFormat() {
  const locale = useLocale();
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  return {
    money: (amount: number) => formatMoney(amount, locale),
    date: (value: string | Date) => format.dateTime(new Date(value), { day: "numeric", month: "short", year: "numeric" }),
    dateTime: (value: string | Date) =>
      format.dateTime(new Date(value), { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
    relative: (value: string | Date) => format.relativeTime(new Date(value), now),
    /** Whole days since a date (time in status, late orders). */
    daysSince: (value: string | Date) => Math.max(0, Math.floor((now.getTime() - new Date(value).getTime()) / 86_400_000)),
  };
}
